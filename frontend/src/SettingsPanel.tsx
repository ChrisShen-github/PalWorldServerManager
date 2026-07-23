import { FormEvent, useCallback, useEffect, useState, type ChangeEvent } from "react";
import ThemeToggle from "./ThemeToggle";
import ServerConfigPanel from "./ServerConfigPanel";
import "./settings.css";
import "./settings-overrides.css";

type Settings = {
  demo_mode: boolean;
  rest_url: string;
  rest_username: string;
  rest_password: string;
  steamcmd_path: string;
  server_path: string;
};

type Operation = "install" | "update" | "start" | "stop" | "restart";
type HostReply = { ok: boolean; agent_connected: boolean; service_installed: boolean | null; service_state?: string; message: string };
type StreamEvent = { event: "progress" | "complete"; ok?: boolean; message: string };

const initial: Settings = {
  demo_mode: true,
  rest_url: "http://host.docker.internal:8212/v1/api",
  rest_username: "admin",
  rest_password: "",
  steamcmd_path: "/opt/steamcmd",
  server_path: "/opt/palserver",
};

const operationLabel: Record<Operation, string> = {
  install: "安装 SteamCMD 与服务器",
  update: "更新服务器",
  start: "启动服务器",
  stop: "停止服务器",
  restart: "重启服务器",
};

const cleanTerminalOutput = (message: string) => message.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");

const confirmationCopy: Record<Exclude<Operation, "start">, { title: string; detail: string; confirm: string }> = {
  install: {
    title: "开始安装原生专服？",
    detail: "将以宿主机的 palworld 用户安装系统依赖、SteamCMD 和 PalServer，并创建 systemd 服务。下载过程可能持续数分钟。",
    confirm: "确认开始安装",
  },
  update: {
    title: "更新服务器？",
    detail: "更新前会停止 palworld-server 服务，验证完成后自动重新启动。在线玩家将暂时断开。",
    confirm: "确认更新并重启",
  },
  stop: {
    title: "停止服务器？",
    detail: "服务器会立即停止，在线玩家将断开连接。建议先完成一次存档备份。",
    confirm: "确认停止服务器",
  },
  restart: {
    title: "重启服务器？",
    detail: "服务器会短暂离线，在线玩家将断开连接。",
    confirm: "确认重启服务器",
  },
};

export default function SettingsPanel() {
  const [values, setValues] = useState(initial);
  const [feedback, setFeedback] = useState("正在读取设置…");
  const [saving, setSaving] = useState(false);
  const [host, setHost] = useState<HostReply | null>(null);
  const [checkingHost, setCheckingHost] = useState(true);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [confirming, setConfirming] = useState<Exclude<Operation, "start"> | null>(null);
  const [operationLog, setOperationLog] = useState("");

  const refreshHost = useCallback(async () => {
    setCheckingHost(true);
    try {
      const response = await fetch("/api/host/status");
      setHost(await response.json() as HostReply);
    } catch {
      setHost({ ok: false, agent_connected: false, service_installed: false, message: "无法连接管理面板 API，请检查容器状态。" });
    } finally {
      setCheckingHost(false);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    const response = await fetch("/api/settings");
    if (!response.ok) throw new Error("settings");
    setValues(await response.json() as Settings);
  }, []);

  useEffect(() => {
    void refreshSettings()
      .then(() => setFeedback(""))
      .catch(() => setFeedback("无法读取设置，请确认管理面板 API 可用。"));
    void refreshHost();
  }, [refreshHost, refreshSettings]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirming(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const change = (key: keyof Settings) => (event: ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));
  };

  const persistSettings = useCallback(async (showSuccess = true) => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error("save");
      if (showSuccess) setFeedback("设置已保存。");
      return true;
    } catch {
      setFeedback("保存失败，请检查填写内容后重试。");
      return false;
    } finally {
      setSaving(false);
    }
  }, [values]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    await persistSettings();
  };

  const execute = async (nextOperation: Operation) => {
    setConfirming(null);
    setOperation(nextOperation);
    setOperationLog("");
    setFeedback(nextOperation === "install" ? "正在安装 SteamCMD 与 PalServer；下载可能持续数分钟，请保持页面打开。" : `正在${operationLabel[nextOperation]}…`);
    const saved = await persistSettings(false);
    if (!saved) {
      setOperation(null);
      return;
    }
    try {
      const response = await fetch(`/api/host/${nextOperation}/stream`, { method: "POST" });
      if (!response.ok || !response.body) throw new Error("stream");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedProgress = false;
      let completed = false;
      let lines: string[] = [];
      const appendLog = (message: string) => {
        const cleanMessage = cleanTerminalOutput(message);
        if (!cleanMessage) return;
        lines = [...lines, cleanMessage];
        setOperationLog(lines.join("\n"));
      };
      const handleEvent = (event: StreamEvent) => {
        if (event.event === "progress") {
          receivedProgress = true;
          appendLog(event.message);
          return;
        }
        completed = true;
        setFeedback(event.ok ? `${operationLabel[nextOperation]}完成。` : `操作未完成：${event.message}`);
        if (!event.ok || !receivedProgress) appendLog(event.message);
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const packet = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = packet.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (data) handleEvent(JSON.parse(data) as StreamEvent);
          boundary = buffer.indexOf("\n\n");
        }
        if (done) break;
      }
      if (!completed) throw new Error("incomplete stream");
    } catch {
      setFeedback("操作请求失败，请检查管理面板与宿主机代理是否正在运行。");
    } finally {
      setOperation(null);
      await refreshHost();
    }
  };

  const requestOperation = (nextOperation: Operation) => {
    if (nextOperation === "start") {
      void execute(nextOperation);
      return;
    }
    setConfirming(nextOperation);
  };

  const agentReady = host?.agent_connected === true;
  const serviceMissing = host?.service_installed === false;
  const serviceStatusUnknown = agentReady && host?.service_installed === null;
  const serviceState = host?.service_state;
  const agentSummary = !agentReady
    ? host?.message ?? "正在读取状态…"
    : serviceMissing
      ? "服务安装、更新与运行状态会显示在指挥台。"
      : serviceState === "active"
        ? "服务正在运行；实时状态和训练家数据请前往指挥台查看。"
        : serviceState === "inactive"
          ? "服务已安装但当前停止；可在下方启动，运行状态会同步到指挥台。"
          : host?.message ?? "正在读取状态…";
  const busy = saving || operation !== null;

  return (
    <div className="settings-page">
      <div className="settings-toolbar"><ThemeToggle /></div>
      <section className="settings-hero" aria-labelledby="settings-title">
        <p className="eyebrow">HOST · NATIVE INSTALLATION</p>
        <h1 id="settings-title">主机与服务器设置</h1>
        <p>面板在 Docker 中运行；SteamCMD 与 PalServer 由 Ubuntu 宿主机原生管理。路径和连接信息保存在面板数据目录，不使用 <code>.env</code>。</p>
      </section>

      <section className="setup-steps" aria-label="原生服务器配置步骤">
        <span className="current"><b>1</b>保存路径</span>
        <span className={agentReady ? "current" : ""}><b>2</b>检查宿主机代理</span>
        <span><b>3</b>安装并运行</span>
      </section>

      <div className="settings-grid">
        <form className="settings-card settings-form" onSubmit={save}>
          <div className="settings-card-heading">
            <div>
              <p className="eyebrow">CONNECTION & PATHS</p>
              <h2>连接与安装位置</h2>
            </div>
            <button className="button button-primary" disabled={busy} type="submit">{saving ? "保存中…" : "保存设置"}</button>
          </div>

          <fieldset>
            <legend>连接设置</legend>
            <label className="switch-row">
              <input checked={values.demo_mode} onChange={change("demo_mode")} type="checkbox" />
              <span><strong>演示模式</strong><small>开启时不请求真实帕鲁服务器 REST API。</small></span>
            </label>
            <div className="field-grid">
              <label>REST 地址<input autoComplete="url" disabled={busy} onChange={change("rest_url")} required value={values.rest_url} /></label>
              <label>用户名<input autoComplete="username" disabled={busy} onChange={change("rest_username")} required value={values.rest_username} /></label>
              <label className="field-wide">管理员密码<input autoComplete="current-password" disabled={busy} onChange={change("rest_password")} type="password" value={values.rest_password} /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>原生安装目录</legend>
            <p className="field-help">仅允许使用 <code>/opt</code> 下的目录，避免面板写入任意宿主机路径。</p>
            <div className="field-grid">
              <label>SteamCMD 目录<input disabled={busy} onChange={change("steamcmd_path")} required value={values.steamcmd_path} /></label>
              <label>帕鲁服务器目录<input disabled={busy} onChange={change("server_path")} required value={values.server_path} /></label>
            </div>
          </fieldset>
        </form>

        <aside className="settings-side" aria-label="宿主机代理与服务器操作">
          <section className="settings-card agent-card">
            <div className="settings-card-heading">
              <div>
                <p className="eyebrow">HOST AGENT</p>
                <h2>宿主机代理</h2>
              </div>
              <button aria-label="重新检查宿主机代理" className="button button-secondary" disabled={checkingHost || busy} onClick={() => void refreshHost()} type="button">{checkingHost ? "检查中…" : "重新检查"}</button>
            </div>
            <p className={`agent-state ${agentReady ? "ready" : "missing"}`} role="status"><i />{checkingHost ? "正在检查代理状态…" : agentReady ? serviceMissing ? "代理已连接 · 服务未安装" : serviceStatusUnknown ? "代理已连接 · 状态待确认" : "代理与服务器已就绪" : "代理未连接"}</p>
            <p className="agent-message">{agentSummary}</p>
            {!agentReady && !checkingHost && <p className="agent-hint">先在 Ubuntu 的 Compose 目录执行 <code>sudo ./host-agent/install.sh</code>，然后点击“重新检查”。</p>}
          </section>

          <section className="settings-card operations-card">
            <p className="eyebrow">SERVER OPERATIONS</p>
            <h2>服务器操作</h2>
            <p>安装会保存上方路径，并通过受限代理执行固定的系统操作。</p>
            {agentReady && serviceMissing && <p className="operations-hint" role="status">服务尚未安装；请先使用下方“安装 SteamCMD 与服务器”。其他服务操作会在安装完成后开放。</p>}
            {serviceStatusUnknown && <p className="operations-hint" role="status">当前代理未能确认服务状态。服务操作仍可使用；请先尝试“启动”，随后重新检查。</p>}
            <div className="operation-actions">
              <button className="button button-primary operation-install" disabled={!agentReady || busy} onClick={() => requestOperation("install")} type="button">{operation === "install" ? "正在安装…" : "安装 SteamCMD 与服务器"}</button>
              <button className="button button-secondary" disabled={!agentReady || serviceMissing || busy} onClick={() => requestOperation("update")} type="button">{operation === "update" ? "正在更新…" : "更新服务器"}</button>
              <button className="button button-secondary" disabled={!agentReady || serviceMissing || busy} onClick={() => requestOperation("start")} type="button">{operation === "start" ? "正在启动…" : "启动"}</button>
              <button className="button button-secondary" disabled={!agentReady || serviceMissing || busy} onClick={() => requestOperation("restart")} type="button">{operation === "restart" ? "正在重启…" : "重启"}</button>
              <button className="button button-danger" disabled={!agentReady || serviceMissing || busy} onClick={() => requestOperation("stop")} type="button">{operation === "stop" ? "正在停止…" : "停止"}</button>
            </div>
          </section>
        </aside>
      </div>

      <ServerConfigPanel disabled={!agentReady || serviceMissing || busy} onSaved={refreshSettings} restPasswordReady={Boolean(values.rest_password)} />

      <section aria-live="polite" className={`operation-feedback ${feedback.includes("失败") || feedback.includes("未完成") || feedback.includes("无法") ? "error" : ""}`}>
        <p className="eyebrow">OPERATION FEEDBACK</p>
        <pre>{feedback || "保存设置后，检查宿主机代理并开始安装。"}</pre>
        {operationLog && <details className="operation-log"><summary>查看本次操作过程日志</summary><pre>{operationLog}</pre></details>}
      </section>

      {confirming && <div aria-labelledby="confirmation-title" aria-modal="true" className="confirmation-scrim" role="dialog">
        <section className="confirmation-dialog">
          <p className="eyebrow">CONFIRM OPERATION</p>
          <h2 id="confirmation-title">{confirmationCopy[confirming].title}</h2>
          <p>{confirmationCopy[confirming].detail}</p>
          <dl>
            <div><dt>SteamCMD</dt><dd>{values.steamcmd_path}</dd></div>
            <div><dt>服务器</dt><dd>{values.server_path}</dd></div>
          </dl>
          <div className="dialog-actions">
            <button autoFocus className="button button-secondary" onClick={() => setConfirming(null)} type="button">取消</button>
            <button className={confirming === "stop" ? "button button-danger" : "button button-primary"} onClick={() => void execute(confirming)} type="button">{confirmationCopy[confirming].confirm}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import SettingsPanel from "./SettingsPanel";
import BackupPanel from "./BackupPanel";
import OperationLogPanel from "./OperationLogPanel";
import CompanionPanel from "./CompanionPanel";
import GameManagementPanel from "./GameManagementPanel";
import { PageShell } from "./PageShell";
import { PalIcon, type PalIconName } from "./PalIcons";
import ThemeToggle from "./ThemeToggle";
import "./dashboard-overrides.css";
import "./monitoring.css";

type Overview = {
  status: "online" | "offline" | "demo";
  checked_at: string;
  message: string;
  server: { version: string; name: string; description: string; world_guid: string };
  metrics: { server_fps: number; frame_time_ms: number; current_players: number; max_players: number; uptime_seconds: number; base_camps: number; world_days: number };
  players: Array<{ name: string; account_name: string; player_id: string; ping: number; level: number; building_count: number }>;
};

type HostStatus = {
  agent_connected: boolean;
  service_installed: boolean | null;
  service_state?: "active" | "inactive" | "failed" | "activating" | "deactivating" | "not-installed" | "unknown";
  message: string;
};

type MonitorHost = {
  sampled_at: string;
  service_state: string;
  cpu_percent: number;
  cpu_cores: number;
  load_1m: number;
  memory_total_bytes: number;
  memory_available_bytes: number;
  disk_total_bytes: number;
  disk_free_bytes: number;
  disk_used_bytes: number;
  palworld: { pid: number | null; cpu_percent: number; memory_bytes: number };
};

type Monitoring = {
  ok: boolean;
  message: string;
  host?: MonitorHost;
  game?: { source: string; server_fps: number; current_players: number; max_players: number };
  history?: Array<{ sampled_at: string; host_cpu_percent: number; host_memory_percent: number; disk_used_percent: number; palworld_cpu_percent: number; palworld_memory_bytes: number; server_fps: number | null; current_players: number | null }>;
};

type DashboardOperation = "start" | "restart" | "stop";
type StreamEvent = { event: "progress" | "complete"; ok?: boolean; message: string };

const empty: Overview = {
  status: "offline",
  checked_at: new Date().toISOString(),
  message: "管理 API 暂不可用。",
  server: { version: "—", name: "等待服务器连接", description: "", world_guid: "—" },
  metrics: { server_fps: 0, frame_time_ms: 0, current_players: 0, max_players: 0, uptime_seconds: 0, base_camps: 0, world_days: 0 },
  players: [],
};

const disconnectedHost: HostStatus = {
  agent_connected: false,
  service_installed: null,
  service_state: "unknown",
  message: "尚未连接宿主机代理。",
};

const emptyMonitoring: Monitoring = { ok: false, message: "正在等待宿主机监控数据。", history: [] };

const dashboardOperationLabel: Record<DashboardOperation, string> = {
  start: "启动服务器",
  restart: "重启服务器",
  stop: "停止服务器",
};

const dashboardConfirmation: Record<Exclude<DashboardOperation, "start">, { title: string; detail: string; confirm: string }> = {
  restart: {
    title: "确认重启服务器？",
    detail: "服务器会短暂离线，在线训练家将断开连接。",
    confirm: "确认重启",
  },
  stop: {
    title: "确认停止服务器？",
    detail: "服务器会立即停止，在线训练家将断开连接。建议先完成一次存档备份。",
    confirm: "确认停止",
  },
};

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

function ratio(part: number, total: number) {
  return total > 0 ? Math.min(100, Math.max(0, (part / total) * 100)) : 0;
}

function nativeService(host: HostStatus) {
  if (!host.agent_connected) return { label: "代理未连接", detail: "无法读取 Ubuntu 原生服务状态。", tone: "offline" };
  if (host.service_installed === false) return { label: "尚未安装", detail: "SteamCMD 与 PalServer 尚未安装。", tone: "demo" };
  if (host.service_state === "active") return { label: "服务运行中", detail: "Palworld systemd 服务正在运行。", tone: "online" };
  if (host.service_state === "inactive") return { label: "服务已停止", detail: "服务已安装，可在设置中启动。", tone: "offline" };
  if (host.service_state === "failed") return { label: "服务异常", detail: "服务启动失败，请查看主机日志。", tone: "offline" };
  if (host.service_state === "activating" || host.service_state === "deactivating") return { label: "状态切换中", detail: "正在启动或停止，请稍候刷新。", tone: "demo" };
  return { label: "状态待确认", detail: host.message, tone: "demo" };
}

export default function App() {
  if (new URLSearchParams(location.search).get("view") === "game") return <PageShell active="game" mainClassName="page-shell-main"><GameManagementPanel /></PageShell>;
  if (new URLSearchParams(location.search).get("view") === "settings") return <PageShell active="settings" mainClassName="page-shell-main"><SettingsPanel /></PageShell>;
  if (new URLSearchParams(location.search).get("view") === "backups") return <PageShell active="backups" mainClassName="page-shell-main"><BackupPanel /></PageShell>;
  if (new URLSearchParams(location.search).get("view") === "operations") return <PageShell active="operations" mainClassName="page-shell-main"><OperationLogPanel /></PageShell>;
  if (new URLSearchParams(location.search).get("view") === "paldex") return <CompanionPanel view="paldex" />;
  if (new URLSearchParams(location.search).get("view") === "paldex-detail") return <CompanionPanel view="paldex-detail" />;
  if (new URLSearchParams(location.search).get("view") === "map") return <CompanionPanel view="map" />;

  const [overview, setOverview] = useState(empty);
  const [host, setHost] = useState(disconnectedHost);
  const [monitoring, setMonitoring] = useState(emptyMonitoring);
  const [busy, setBusy] = useState(true);
  const [hostOperation, setHostOperation] = useState<DashboardOperation | null>(null);
  const [confirmingOperation, setConfirmingOperation] = useState<Exclude<DashboardOperation, "start"> | null>(null);
  const [hostFeedback, setHostFeedback] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    const [overviewResult, hostResult, monitoringResult] = await Promise.allSettled([
      fetch("/api/server/overview"),
      fetch("/api/host/status"),
      fetch("/api/monitoring"),
    ]);
    if (overviewResult.status === "fulfilled" && overviewResult.value.ok) {
      setOverview(await overviewResult.value.json() as Overview);
    } else {
      setOverview({ ...empty, checked_at: new Date().toISOString() });
    }
    if (hostResult.status === "fulfilled" && hostResult.value.ok) {
      setHost(await hostResult.value.json() as HostStatus);
    } else {
      setHost(disconnectedHost);
    }
    if (monitoringResult.status === "fulfilled" && monitoringResult.value.ok) {
      setMonitoring(await monitoringResult.value.json() as Monitoring);
    } else {
      setMonitoring(emptyMonitoring);
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!confirmingOperation) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmingOperation(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmingOperation]);

  const executeHostOperation = async (operation: DashboardOperation) => {
    setConfirmingOperation(null);
    setHostOperation(operation);
    setHostFeedback(`正在${dashboardOperationLabel[operation]}…`);
    try {
      const response = await fetch(`/api/host/${operation}/stream`, { method: "POST" });
      if (!response.ok || !response.body) throw new Error("无法连接宿主机代理。请检查 Agent 状态后重试。");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const packet = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = packet.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (data) {
            const event = JSON.parse(data) as StreamEvent;
            setHostFeedback(event.message);
            if (event.event === "complete") {
              completed = true;
              if (!event.ok) throw new Error(event.message);
              setHostFeedback(`${dashboardOperationLabel[operation]}完成。`);
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
        if (done) break;
      }
      if (!completed) throw new Error("操作连接意外结束，请到运行日志查看结果。");
    } catch (error) {
      setHostFeedback(`操作未完成：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      await refresh();
      setHostOperation(null);
    }
  };

  const native = nativeService(host);
  const restLabel = overview.status === "online" ? "REST 已连接" : overview.status === "demo" ? "演示模式" : "REST 未连接";
  const serviceAvailable = host.agent_connected && host.service_installed !== false;
  const serviceRunning = host.service_state === "active";
  const serviceChanging = host.service_state === "activating" || host.service_state === "deactivating";
  const controlsDisabled = !serviceAvailable || serviceChanging || hostOperation !== null;

  return <PageShell active="dashboard">
      <header>
        <div className="crumb">服务器管理　/　<strong>指挥台</strong></div>
        <div className="pal-header-actions">
          <span className={`status ${native.tone}`}><i />{native.label}</span>
          <button aria-label={busy ? "正在同步数据" : "刷新服务器数据"} className="refresh" onClick={() => void refresh()} disabled={busy}><PalIcon name="refresh" /><span>{busy ? "同步中…" : "刷新数据"}</span></button>
          <ThemeToggle />
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">PALPAGOS ISLANDS · CONTROL CENTER</p>
          <h1>{overview.server.name}</h1>
          <p>{overview.server.description || "先在面板设置中完成原生服务器安装与连接。"}</p>
          <small>{overview.server.version}　·　世界 ID {overview.server.world_guid.slice(0, 8)}</small>
        </div>
        <div className="orb"><PalIcon className="orb-icon" name="sphere" /><b><strong>{overview.metrics.server_fps.toFixed(0)}</strong><small>SERVER FPS</small></b></div>
      </section>

      <section className="service-overview" aria-label="原生服务状态">
        <div className={`service-state ${native.tone}`}><i /><span><strong>{native.label}</strong><small>{native.detail}</small></span></div>
        <div className="service-rest"><span>游戏数据</span><strong>{restLabel}</strong><small>{overview.message}</small></div>
        <div aria-label="服务器快捷操作" className="service-controls">
          <button className="service-control start" disabled={controlsDisabled || serviceRunning} onClick={() => void executeHostOperation("start")} type="button">{hostOperation === "start" ? "正在启动…" : "启动"}</button>
          <button className="service-control" disabled={controlsDisabled || !serviceRunning} onClick={() => setConfirmingOperation("restart")} type="button">{hostOperation === "restart" ? "正在重启…" : "重启"}</button>
          <button className="service-control stop" disabled={controlsDisabled || !serviceRunning} onClick={() => setConfirmingOperation("stop")} type="button">{hostOperation === "stop" ? "正在停止…" : "停止"}</button>
          <button className="service-settings" onClick={() => { location.href = "?view=settings"; }} type="button">服务器设置</button>
        </div>
        {hostFeedback && <p aria-live="polite" className={`service-operation-feedback ${hostFeedback.startsWith("操作未完成") ? "error" : ""}`}>{hostFeedback}</p>}
      </section>

      <section className="metrics">
        <Metric icon="trainers" l="在线训练家" v={`${overview.metrics.current_players}/${overview.metrics.max_players || "—"}`} d="当前在线玩家" />
        <Metric icon="pulse" l="服务器帧率" v={`${overview.metrics.server_fps.toFixed(0)} FPS`} d={`${overview.metrics.frame_time_ms.toFixed(1)} ms 每帧`} />
        <Metric icon="sphere" l="世界进程" v={`第 ${overview.metrics.world_days} 天`} d={`${overview.metrics.base_camps} 座基地`} />
        <Metric icon="server" l="原生服务" v={native.label} d={host.agent_connected ? "宿主机代理已连接" : "等待宿主机代理"} />
      </section>

      <HostMonitor monitoring={monitoring} />

      <section className="content">
        <article className="panel">
          <div className="head"><div><p className="eyebrow">LIVE TRAINERS</p><h2>在线训练家</h2></div></div>
          {overview.players.length
            ? <div className="table">{overview.players.map((player) => <div className="tr" key={player.player_id}><span className="player"><b>{player.name[0]}</b><span><strong>{player.name}</strong><small>@{player.account_name}</small></span></span><span>Lv. {player.level}</span><span>{player.ping.toFixed(0)} ms</span><span>{player.building_count} 建造物</span></div>)}</div>
            : <div className="empty"><strong>这里还没有训练家</strong><span>{overview.status === "online" ? "当前没有训练家在线。" : "请确认 REST API 设置，连接后将显示训练家数据。"}</span></div>}
        </article>
        <article className="panel note native-note">
          <p className="eyebrow">NATIVE SERVER</p>
          <h2>{native.label}</h2>
          <p>{native.detail}</p>
          <dl><div><dt>宿主机代理</dt><dd>{host.agent_connected ? "已连接" : "未连接"}</dd></div><div><dt>游戏数据</dt><dd>{restLabel}</dd></div></dl>
          <button onClick={() => { location.href = "?view=settings"; }}>{host.service_installed === false ? "开始安装" : "管理服务器"}</button>
        </article>
      </section>
      {confirmingOperation && <div aria-labelledby="dashboard-confirmation-title" aria-modal="true" className="dashboard-confirmation-scrim" role="dialog">
        <section className="dashboard-confirmation-dialog">
          <p className="eyebrow">CONFIRM NATIVE SERVER ACTION</p>
          <h2 id="dashboard-confirmation-title">{dashboardConfirmation[confirmingOperation].title}</h2>
          <p>{dashboardConfirmation[confirmingOperation].detail}</p>
          <dl><div><dt>当前服务</dt><dd>{native.label}</dd></div><div><dt>任务日志</dt><dd>将保存至运行日志页</dd></div></dl>
          <div className="dashboard-dialog-actions"><button autoFocus className="service-control" onClick={() => setConfirmingOperation(null)} type="button">取消</button><button className={confirmingOperation === "stop" ? "service-control stop" : "service-control start"} onClick={() => void executeHostOperation(confirmingOperation)} type="button">{dashboardConfirmation[confirmingOperation].confirm}</button></div>
        </section>
      </div>}
  </PageShell>;
}

function Metric({ icon, l, v, d }: { icon: PalIconName; l: string; v: string; d: string }) {
  return <article className="card"><PalIcon className="metric-icon" name={icon} /><p>{l}</p><strong>{v}</strong><small>{d}</small></article>;
}

function HostMonitor({ monitoring }: { monitoring: Monitoring }) {
  const host = monitoring.host;
  const memory = host ? ratio(host.memory_total_bytes - host.memory_available_bytes, host.memory_total_bytes) : 0;
  const disk = host ? ratio(host.disk_used_bytes, host.disk_total_bytes) : 0;
  const health = !host ? "offline" : host.service_state !== "active" || disk >= 90 || memory >= 90 ? "warning" : "online";
  const summary = !host ? monitoring.message : health === "warning" ? "有需要留意的资源或服务状态。" : `负载 ${host.load_1m.toFixed(2)} · ${host.cpu_cores} 核 CPU`;
  const history = monitoring.history ?? [];
  return <section className="host-monitor panel" aria-labelledby="host-monitor-title">
    <header className="host-monitor-heading"><div><p className="eyebrow">HOST TELEMETRY · 24H</p><h2 id="host-monitor-title">宿主机运行监控</h2><p>{summary}</p></div><span className={`host-monitor-state ${health}`}><i />{health === "online" ? "状态正常" : health === "warning" ? "需要留意" : "暂不可用"}</span></header>
    <div className="host-stat-grid">
      <HostStat label="主机 CPU" value={host ? `${host.cpu_percent.toFixed(1)}%` : "—"} detail={host ? `1 分钟负载 ${host.load_1m.toFixed(2)}` : "等待宿主机代理"} tone={host && host.cpu_percent >= 90 ? "warning" : ""} />
      <HostStat label="主机内存" value={host ? `${memory.toFixed(0)}%` : "—"} detail={host ? `${bytes(host.memory_available_bytes)} 可用` : "等待宿主机代理"} tone={memory >= 90 ? "warning" : ""} />
      <HostStat label="Palworld 进程" value={host?.palworld.pid ? bytes(host.palworld.memory_bytes) : "未运行"} detail={host?.palworld.pid ? `PID ${host.palworld.pid} · CPU ${host.palworld.cpu_percent.toFixed(1)}%` : "未检测到游戏进程"} tone={!host?.palworld.pid && host?.service_state === "active" ? "warning" : ""} />
      <HostStat label="服务器磁盘" value={host ? `${disk.toFixed(0)}%` : "—"} detail={host ? `${bytes(host.disk_free_bytes)} 可用` : "等待宿主机代理"} tone={disk >= 90 ? "warning" : ""} />
    </div>
    <div className="host-trends">
      <Trend label="主机 CPU" unit="%" values={history.map((item) => item.host_cpu_percent)} color="teal" />
      <Trend label="内存占用" unit="%" values={history.map((item) => item.host_memory_percent)} color="mint" />
      <Trend label="服务器 FPS" unit=" FPS" values={history.map((item) => item.server_fps ?? 0)} color="gold" unavailable={!history.some((item) => item.server_fps !== null)} />
      <Trend label="在线训练家" unit=" 人" values={history.map((item) => item.current_players ?? 0)} color="blue" unavailable={!history.some((item) => item.current_players !== null)} />
    </div>
    <p className="host-monitor-foot">趋势按面板每 20 秒刷新时采样；最多保留 720 个样本。游戏 FPS 和在线人数需要已连接 Palworld REST API。</p>
  </section>;
}

function HostStat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <article className={tone ? `host-stat ${tone}` : "host-stat"}><p>{label}</p><strong>{value}</strong><small>{detail}</small></article>;
}

function Trend({ label, unit, values, color, unavailable = false }: { label: string; unit: string; values: number[]; color: string; unavailable?: boolean }) {
  const usable = values.slice(-120);
  const max = Math.max(1, ...usable);
  const points = usable.length > 1 ? usable.map((value, index) => `${(index / (usable.length - 1)) * 100},${36 - (value / max) * 30}`).join(" ") : "0,36 100,36";
  const latest = usable.at(-1) ?? 0;
  return <article className={`host-trend ${color}`}><header><span>{label}</span><strong>{unavailable ? "—" : `${latest.toFixed(label === "服务器 FPS" ? 0 : 1)}${unit}`}</strong></header><svg aria-label={unavailable ? `${label}暂无可用数据` : `${label}最近趋势`} role="img" viewBox="0 0 100 40"><path d="M0 36H100" /><polyline points={points} /></svg><small>{unavailable ? "等待 REST 数据" : `${usable.length} 个样本`}</small></article>;
}

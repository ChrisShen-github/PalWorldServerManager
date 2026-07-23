import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useState } from "react";
import { PalIcon } from "./PalIcons";
import ThemeToggle from "./ThemeToggle";
import "./backup.css";

type Backup = { id: string; name: string; created_at: string; size_bytes: number };
type Storage = { backup_bytes: number; backup_count: number; disk_total_bytes: number; disk_free_bytes: number; disk_used_bytes: number };
type Schedule = { enabled: boolean; hour: number; minute: number; timezone: string; timer_active?: boolean };
type Reply = { ok: boolean; agent_connected: boolean; message: string; backups?: Backup[]; retention?: number; storage?: Storage; schedule?: Schedule };
type StreamEvent = { event: "progress" | "complete"; ok?: boolean; message: string };
type Pending = { kind: "create" | "import" } | { kind: "restore-review" | "restore-confirm" | "delete" | "rename"; backup: Backup };
type BackupPending = Exclude<Pending, { kind: "create" | "import" }>;

function hasBackup(value: Pending): value is BackupPending {
  return value.kind !== "create" && value.kind !== "import";
}

class BackupErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Keep backup failures visible instead of blanking the page. */ }
  render() {
    if (this.state.failed) return <div className="backup-page"><section className="backup-panel backup-render-error" role="alert"><p className="eyebrow">BACKUP PAGE RECOVERY</p><h1>备份页面需要重新加载</h1><p>页面交互发生异常，但不会影响已创建的主机备份。请刷新页面后重试。</p><button className="button button-primary" onClick={() => location.reload()} type="button">重新加载页面</button></section></div>;
    return this.props.children;
  }
}

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

function percent(value: number, total: number) {
  return total > 0 ? Math.min(100, Math.max(0, Math.round((value / total) * 100))) : 0;
}

function date(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "未知时间";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(parsed);
  } catch {
    return parsed.toISOString().replace("T", " ").slice(0, 16);
  }
}

function defaultBackupName(value = new Date()) {
  try {
    const values = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value).reduce<Record<string, string>>((parts, part) => ({ ...parts, [part.type]: part.value }), {});
    return `世界备份 ${values.year}${values.month}${values.day}T${values.hour}${values.minute}${values.second}${String(value.getMilliseconds()).padStart(3, "0")}000Z`;
  } catch {
    return `世界备份 ${value.toISOString().replace(/[-:.]/g, "").replace("T", "T")}`;
  }
}

const clean = (value: string) => value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");

export default function BackupPanel() {
  return <BackupErrorBoundary><BackupPanelContent /></BackupErrorBoundary>;
}

function BackupPanelContent() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [retention, setRetention] = useState(12);
  const [message, setMessage] = useState("正在读取主机备份目录…");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<"create" | "import" | "restore" | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [draftName, setDraftName] = useState(() => defaultBackupName());
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [log, setLog] = useState("");
  const [storage, setStorage] = useState<Storage | null>(null);
  const [schedule, setSchedule] = useState<Schedule>({ enabled: false, hour: 4, minute: 0, timezone: "Asia/Shanghai" });
  const [savingSchedule, setSavingSchedule] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/backups");
      const data = await response.json() as Reply;
      if (!response.ok || !data.ok) throw new Error(data.message);
      setBackups(data.backups ?? []);
      setRetention(data.retention ?? 12);
      setStorage(data.storage ?? null);
      setSchedule(data.schedule ?? { enabled: false, hour: 4, minute: 0, timezone: "Asia/Shanghai" });
      setMessage(data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取备份列表，请检查宿主机代理。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !running) setPending(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [running]);

  const saveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const response = await fetch("/api/backups/schedule", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: schedule.enabled, hour: schedule.hour, minute: schedule.minute }) });
      const data = await response.json() as Reply;
      if (!response.ok || !data.ok) throw new Error(data.message);
      setMessage(data.message);
      if (data.schedule) setSchedule(data.schedule);
    } catch (error) {
      setMessage(`自动备份设置失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setSavingSchedule(false);
    }
  };

  const stream = async (path: string, body?: object | FormData) => {
    const isForm = body instanceof FormData;
    const response = await fetch(path, { method: "POST", headers: body && !isForm ? { "Content-Type": "application/json" } : undefined, body: body ? isForm ? body : JSON.stringify(body) : undefined });
    if (!response.ok || !response.body) {
      const failure = await response.json().catch(() => null) as { detail?: string; message?: string } | null;
      throw new Error(failure?.detail || failure?.message || "请求未能启动，请检查宿主机代理。");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const packet = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const line = packet.split("\n").find((item) => item.startsWith("data: "))?.slice(6);
        if (line) {
          const event = JSON.parse(line) as StreamEvent;
          if (event.event === "progress") setLog((previous) => `${previous}${previous ? "\n" : ""}${clean(event.message)}`);
          if (event.event === "complete") {
            completed = true;
            setMessage(event.ok ? event.message : `操作未完成：${event.message}`);
            if (!event.ok) throw new Error(event.message);
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
    if (!completed) throw new Error("操作连接意外结束。");
  };

  const execute = async () => {
    if (!pending) return;
    const current = pending;
    const selectedImport = importFile;
    setPending(null);
    setLog("");
    if (current.kind === "delete" || current.kind === "rename") {
      setMessage(current.kind === "rename" ? "正在更新备份名称…" : "正在删除备份…");
      try {
        const response = await fetch(`/api/backups/${encodeURIComponent(current.backup.id)}`, current.kind === "rename" ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draftName }) } : { method: "DELETE" });
        const data = await response.json() as Reply;
        if (!response.ok || !data.ok) throw new Error(data.message);
        setMessage(data.message);
      } catch (error) {
        setMessage(`${current.kind === "rename" ? "改名" : "删除"}失败：${error instanceof Error ? error.message : "未知错误"}`);
      } finally { await refresh(); }
      return;
    }
    if (current.kind === "import" && !selectedImport) {
      setMessage("请先选择要导入的 .tar.gz 世界备份包。");
      return;
    }
    setRunning(current.kind === "create" ? "create" : current.kind === "import" ? "import" : "restore");
    setMessage(current.kind === "create" ? "正在创建安全备份；服务会短暂停服并自动恢复。" : current.kind === "import" ? "正在上传并校验世界备份包…" : "正在恢复存档；会先保护当前版本并自动恢复服务。");
    try {
      if (current.kind === "import") {
        const form = new FormData();
        form.append("name", draftName);
        form.append("archive", selectedImport!, selectedImport!.name);
        await stream("/api/backups/import/stream", form);
      } else if (current.kind === "create") {
        await stream("/api/backups/create/stream", { name: draftName });
      } else if (hasBackup(current)) {
        await stream(`/api/backups/${encodeURIComponent(current.backup.id)}/restore/stream`, { confirmed: true });
      }
    } catch (error) {
      setMessage(`操作未完成：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setRunning(null);
      await refresh();
    }
  };

  const title = pending?.kind === "create" ? "立即备份？" : pending?.kind === "import" ? "导入世界备份？" : pending?.kind === "restore-review" ? "恢复这份存档？" : pending?.kind === "restore-confirm" ? "最后确认恢复" : pending?.kind === "rename" ? "修改备份名称" : "删除这份备份？";
  const detail = pending?.kind === "create"
    ? "为了保证备份一致性，面板会短暂停止帕鲁服务，打包全部世界存档后自动重新启动。"
      : pending?.kind === "import"
      ? "仅接受以 SaveGames 为根目录的 .tar.gz 世界备份包。导入时会检查路径、链接和解压体积；导入不会停止服务器。"
      : pending?.kind === "restore-review"
      ? "服务会停止；恢复前会自动备份当前世界。恢复完成后服务将自动重新启动，在线训练家会断开连接。"
      : pending?.kind === "restore-confirm"
      ? "这是不可逆操作。请输入“恢复”完成第二次确认；恢复前的当前世界会作为新的安全备份保留。"
      : pending?.kind === "rename"
        ? "名称只用于面板显示和下载文件名，不会修改归档内容。"
      : "删除后无法从面板恢复。请确认这不是你需要保留的存档版本。";

  return <div className="backup-page">
    <div className="settings-toolbar"><ThemeToggle /></div>
    <section className="backup-hero" aria-labelledby="backup-title">
      <div><p className="eyebrow">WORLD SAVE · NATIVE HOST</p><h1 id="backup-title">存档与备份</h1><p>备份由 Ubuntu 宿主机执行，涵盖完整 <code>SaveGames</code> 世界目录。每次恢复前都会先自动保护当前版本。</p></div>
      <div className="backup-hero-mark"><PalIcon name="backup" /><strong>{backups.length}</strong><small>可用备份</small></div>
    </section>

    <section className="backup-status" aria-live="polite"><div><PalIcon name="server" /><span><strong>{loading ? "正在同步备份目录" : "主机备份库"}</strong><small>{message}</small></span></div><button className="button button-secondary" disabled={loading || running !== null} onClick={() => void refresh()} type="button"><PalIcon name="refresh" />刷新列表</button></section>

    <section className="backup-operations" aria-label="自动备份与存储健康">
      <article className="backup-panel backup-schedule"><header><div><p className="eyebrow">AUTOMATED RECOVERY</p><h2>自动备份</h2><p>由 Ubuntu 宿主机的 systemd timer 执行。时间固定为中国标准时间，创建时仍会短暂停止服务器以保证存档一致性。</p></div><span className={`backup-schedule-state ${schedule.enabled ? "online" : "offline"}`}><i />{schedule.enabled ? "已启用" : "未启用"}</span></header><div className="backup-schedule-controls"><label><span>每日执行时间（中国时区）</span><div><input aria-label="自动备份小时" disabled={savingSchedule} max={23} min={0} onChange={(event) => setSchedule((current) => ({ ...current, hour: Math.max(0, Math.min(23, Number(event.target.value) || 0)) }))} type="number" value={schedule.hour} /><b>:</b><input aria-label="自动备份分钟" disabled={savingSchedule} max={59} min={0} onChange={(event) => setSchedule((current) => ({ ...current, minute: Math.max(0, Math.min(59, Number(event.target.value) || 0)) }))} type="number" value={schedule.minute} /></div></label><label className="backup-schedule-toggle"><input checked={schedule.enabled} disabled={savingSchedule} onChange={(event) => setSchedule((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" /><span><strong>启用每日自动备份</strong><small>{schedule.enabled ? `将在每日 ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")} 自动运行。` : "保持关闭；不会创建任何定时任务。"}</small></span></label><button className="button button-primary" disabled={savingSchedule || loading || running !== null} onClick={() => void saveSchedule()} type="button">{savingSchedule ? "正在保存…" : "保存自动备份设置"}</button></div></article>
      <article className="backup-panel backup-storage"><p className="eyebrow">HOST STORAGE</p><h2>存储健康</h2>{storage ? <><strong>{bytes(storage.disk_free_bytes)} <small>可用空间</small></strong><div aria-label={`磁盘已使用 ${percent(storage.disk_used_bytes, storage.disk_total_bytes)}%`} className="storage-meter"><i style={{ width: `${percent(storage.disk_used_bytes, storage.disk_total_bytes)}%` }} /></div><dl><div><dt>磁盘已用</dt><dd>{percent(storage.disk_used_bytes, storage.disk_total_bytes)}%</dd></div><div><dt>备份库</dt><dd>{bytes(storage.backup_bytes)} · {storage.backup_count} 份</dd></div></dl></> : <p className="backup-storage-empty">正在读取宿主机磁盘状态…</p>}</article>
    </section>

    <section className="backup-panel" aria-labelledby="backup-list-title">
      <header className="backup-panel-heading"><div><p className="eyebrow">RECOVERY POINTS</p><h2 id="backup-list-title">世界恢复点</h2><p>保留最近 {retention} 份面板管理的备份；导入存档也会计入该保留策略。</p></div><div className="backup-panel-actions"><button className="button button-secondary backup-import" disabled={loading || running !== null} onClick={() => { setImportFile(null); setDraftName(defaultBackupName().replace("世界备份", "导入存档")); setPending({ kind: "import" }); }} type="button">导入存档</button><button className="button button-primary backup-create" disabled={loading || running !== null} onClick={() => { setDraftName(defaultBackupName()); setPending({ kind: "create" }); }} type="button"><PalIcon name="backup" />{running === "create" ? "正在备份…" : "立即备份"}</button></div></header>
      {backups.length ? <div className="backup-table" role="list">{backups.map((backup) => <article className="backup-row" key={backup.id} role="listitem"><div className="backup-file"><b><PalIcon name="backup" /></b><span><strong>{backup.name}</strong><small><time dateTime={backup.created_at}>{date(backup.created_at)}</time> · {bytes(backup.size_bytes)} · {backup.id}</small></span></div><div className="backup-actions"><a className="button button-secondary" download href={`/api/backups/${encodeURIComponent(backup.id)}/download`}>下载</a><button className="button button-secondary" disabled={running !== null} onClick={() => { setDraftName(backup.name); setPending({ kind: "rename", backup }); }} type="button">改名</button><button className="button button-secondary" disabled={running !== null} onClick={() => { setRestoreConfirmation(""); setPending({ kind: "restore-review", backup }); }} type="button">恢复</button><button aria-label={`删除备份 ${backup.name}`} className="button button-danger backup-delete" disabled={running !== null} onClick={() => setPending({ kind: "delete", backup })} type="button">删除</button></div></article>)}</div> : <div className="backup-empty"><PalIcon name="backup" /><strong>还没有可用备份</strong><span>先创建一次安全备份，今后更新或调整高风险规则前也建议手动保留一个恢复点。</span></div>}
    </section>
    {log && <details className="backup-log"><summary>查看本次操作日志</summary><pre>{log}</pre></details>}
    {pending && <div aria-labelledby="backup-confirmation-title" aria-modal="true" className="confirmation-scrim" role="dialog"><section className="confirmation-dialog backup-confirmation"><p className="eyebrow">CONFIRM SAVE OPERATION</p><h2 id="backup-confirmation-title">{title}</h2><p>{detail}</p>{(pending.kind === "create" || pending.kind === "rename" || pending.kind === "import") && <label className="backup-name-field">备份名称<input autoFocus maxLength={80} onChange={(event) => setDraftName(event.target.value)} value={draftName} /></label>}{pending.kind === "import" && <label className="backup-name-field">世界备份包<input accept=".tar.gz,application/gzip" aria-describedby="backup-import-help" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} type="file" /><small id="backup-import-help">仅支持从面板下载，或自行打包为 <code>SaveGames/…</code> 结构的 .tar.gz 文件。</small></label>}{pending.kind === "restore-confirm" && <label className="backup-name-field">请输入“恢复”确认<input autoFocus autoComplete="off" onChange={(event) => setRestoreConfirmation(event.target.value)} value={restoreConfirmation} /></label>}{hasBackup(pending) && <dl><div><dt>目标备份</dt><dd>{pending.backup.name}</dd></div><div><dt>创建时间</dt><dd>{date(pending.backup.created_at)}</dd></div></dl>}<div className="dialog-actions"><button autoFocus={pending.kind === "restore-review" || pending.kind === "delete"} className="button button-secondary" onClick={() => setPending(null)} type="button">{pending.kind === "restore-confirm" ? "取消恢复" : "取消"}</button>{pending.kind === "restore-review" && hasBackup(pending) ? <button className="button button-primary" onClick={() => { setRestoreConfirmation(""); setPending({ kind: "restore-confirm", backup: pending.backup }); }} type="button">继续确认</button> : <button className={pending.kind === "delete" ? "button button-danger" : "button button-primary"} disabled={(pending.kind === "create" || pending.kind === "rename" || pending.kind === "import") && !draftName.trim() || pending.kind === "import" && !importFile || pending.kind === "restore-confirm" && restoreConfirmation.trim() !== "恢复"} onClick={() => void execute()} type="button">{pending.kind === "create" ? "确认备份" : pending.kind === "import" ? "上传并导入" : pending.kind === "restore-confirm" ? "确认恢复并重启服务" : pending.kind === "rename" ? "保存名称" : "确认删除"}</button>}</div></section></div>}
  </div>;
}

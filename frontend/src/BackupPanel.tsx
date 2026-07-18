import { useCallback, useEffect, useState } from "react";
import { PalIcon } from "./PalIcons";
import ThemeToggle from "./ThemeToggle";
import "./backup.css";

type Backup = { id: string; created_at: string; size_bytes: number };
type Reply = { ok: boolean; agent_connected: boolean; message: string; backups?: Backup[]; retention?: number };
type StreamEvent = { event: "progress" | "complete"; ok?: boolean; message: string };
type Pending = { kind: "create" } | { kind: "restore" | "delete"; backup: Backup };

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "未知时间" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

const clean = (value: string) => value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");

export default function BackupPanel() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [retention, setRetention] = useState(12);
  const [message, setMessage] = useState("正在读取主机备份目录…");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<"create" | "restore" | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [log, setLog] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/backups");
      const data = await response.json() as Reply;
      if (!response.ok || !data.ok) throw new Error(data.message);
      setBackups(data.backups ?? []);
      setRetention(data.retention ?? 12);
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

  const stream = async (path: string, body?: object) => {
    const response = await fetch(path, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok || !response.body) throw new Error("请求未能启动，请检查宿主机代理。");
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
    setPending(null);
    setLog("");
    if (current.kind === "delete") {
      setMessage("正在删除备份…");
      try {
        const response = await fetch(`/api/backups/${encodeURIComponent(current.backup.id)}`, { method: "DELETE" });
        const data = await response.json() as Reply;
        if (!response.ok || !data.ok) throw new Error(data.message);
        setMessage(data.message);
      } catch (error) {
        setMessage(`删除失败：${error instanceof Error ? error.message : "未知错误"}`);
      } finally { await refresh(); }
      return;
    }
    setRunning(current.kind);
    setMessage(current.kind === "create" ? "正在创建安全备份；服务会短暂停服并自动恢复。" : "正在恢复存档；会先保护当前版本并自动恢复服务。");
    try {
      await stream(current.kind === "create" ? "/api/backups/create/stream" : `/api/backups/${encodeURIComponent(current.backup.id)}/restore/stream`, current.kind === "restore" ? { confirmed: true } : undefined);
    } catch (error) {
      setMessage(`操作未完成：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setRunning(null);
      await refresh();
    }
  };

  const title = pending?.kind === "create" ? "创建安全备份？" : pending?.kind === "restore" ? "恢复这份存档？" : "删除这份备份？";
  const detail = pending?.kind === "create"
    ? "为了保证备份一致性，面板会短暂停止帕鲁服务，打包全部世界存档后自动重新启动。"
    : pending?.kind === "restore"
      ? "服务会停止；恢复前会自动备份当前世界。恢复完成后服务将自动重新启动，在线训练家会断开连接。"
      : "删除后无法从面板恢复。请确认这不是你需要保留的存档版本。";

  return <main className="backup-page" id="main">
    <div className="settings-toolbar"><a className="settings-back" href="/">← 返回指挥台</a><ThemeToggle /></div>
    <section className="backup-hero" aria-labelledby="backup-title">
      <div><p className="eyebrow">WORLD SAVE · NATIVE HOST</p><h1 id="backup-title">存档与备份</h1><p>备份由 Ubuntu 宿主机执行，涵盖完整 <code>SaveGames</code> 世界目录。每次恢复前都会先自动保护当前版本。</p></div>
      <div className="backup-hero-mark"><PalIcon name="backup" /><strong>{backups.length}</strong><small>可用备份</small></div>
    </section>

    <section className="backup-status" aria-live="polite"><div><PalIcon name="server" /><span><strong>{loading ? "正在同步备份目录" : "主机备份库"}</strong><small>{message}</small></span></div><button className="button button-secondary" disabled={loading || running !== null} onClick={() => void refresh()} type="button"><PalIcon name="refresh" />刷新列表</button></section>

    <section className="backup-panel" aria-labelledby="backup-list-title">
      <header className="backup-panel-heading"><div><p className="eyebrow">RECOVERY POINTS</p><h2 id="backup-list-title">世界恢复点</h2><p>保留最近 {retention} 份面板创建的备份；创建新备份时会自动清理更早版本。</p></div><button className="button button-primary backup-create" disabled={loading || running !== null} onClick={() => setPending({ kind: "create" })} type="button"><PalIcon name="backup" />{running === "create" ? "正在创建…" : "立即创建安全备份"}</button></header>
      {backups.length ? <div className="backup-table" role="list">{backups.map((backup) => <article className="backup-row" key={backup.id} role="listitem"><div className="backup-file"><b><PalIcon name="backup" /></b><span><strong>{backup.id}</strong><small><time dateTime={backup.created_at}>{date(backup.created_at)}</time> · {bytes(backup.size_bytes)}</small></span></div><div className="backup-actions"><button className="button button-secondary" disabled={running !== null} onClick={() => setPending({ kind: "restore", backup })} type="button">恢复此版本</button><button aria-label={`删除备份 ${backup.id}`} className="button button-danger backup-delete" disabled={running !== null} onClick={() => setPending({ kind: "delete", backup })} type="button">删除</button></div></article>)}</div> : <div className="backup-empty"><PalIcon name="backup" /><strong>还没有可用备份</strong><span>先创建一次安全备份，今后更新或调整高风险规则前也建议手动保留一个恢复点。</span></div>}
    </section>
    {log && <details className="backup-log"><summary>查看本次操作日志</summary><pre>{log}</pre></details>}
    {pending && <div aria-labelledby="backup-confirmation-title" aria-modal="true" className="confirmation-scrim" role="dialog"><section className="confirmation-dialog backup-confirmation"><p className="eyebrow">CONFIRM SAVE OPERATION</p><h2 id="backup-confirmation-title">{title}</h2><p>{detail}</p>{pending.kind !== "create" && <dl><div><dt>目标备份</dt><dd>{pending.backup.id}</dd></div><div><dt>创建时间</dt><dd>{date(pending.backup.created_at)}</dd></div></dl>}<div className="dialog-actions"><button autoFocus className="button button-secondary" onClick={() => setPending(null)} type="button">取消</button><button className={pending.kind === "delete" ? "button button-danger" : "button button-primary"} onClick={() => void execute()} type="button">{pending.kind === "create" ? "确认创建" : pending.kind === "restore" ? "确认恢复并重启服务" : "确认删除"}</button></div></section></div>}
  </main>;
}

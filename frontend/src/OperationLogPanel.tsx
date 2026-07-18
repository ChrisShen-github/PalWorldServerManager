import { useCallback, useEffect, useMemo, useState } from "react";
import { PalIcon } from "./PalIcons";
import ThemeToggle from "./ThemeToggle";
import "./operation-log.css";

type Operation = {
  id: string;
  action: string;
  label: string;
  status: "running" | "success" | "failed";
  started_at: string;
  finished_at: string | null;
  messages: string[];
};

type Reply = { ok: boolean; agent_connected: boolean; message: string; operations?: Operation[] };
type Filter = "all" | "server" | "backup";

const serverActions = new Set(["install", "update", "start", "stop", "restart"]);

function formatTime(value: string | null) {
  if (!value) return "进行中";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}

function duration(operation: Operation) {
  if (!operation.finished_at) return "仍在执行";
  const from = new Date(operation.started_at).getTime();
  const to = new Date(operation.finished_at).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return "已结束";
  const seconds = Math.round((to - from) / 1000);
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export default function OperationLogPanel() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [message, setMessage] = useState("正在读取宿主机任务记录…");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/operations");
      const data = await response.json() as Reply;
      if (!response.ok || !data.ok) throw new Error(data.message || "无法读取任务日志。");
      setOperations(data.operations ?? []);
      setMessage(data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取任务日志，请检查宿主机代理。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => operations.filter((operation) => filter === "all" || (filter === "server" ? serverActions.has(operation.action) : !serverActions.has(operation.action))), [filter, operations]);
  const completed = operations.filter((operation) => operation.status === "success").length;
  const failed = operations.filter((operation) => operation.status === "failed").length;

  return <main className="operation-page" id="main">
    <div className="settings-toolbar"><a className="settings-back" href="/">← 返回指挥台</a><ThemeToggle /></div>
    <section className="operation-hero" aria-labelledby="operation-title">
      <div><p className="eyebrow">NATIVE HOST · OPERATION HISTORY</p><h1 id="operation-title">运行日志</h1><p>安装、更新、服务启停、手动备份、自动备份和存档恢复都会记录在 Ubuntu 宿主机。页面只显示受限代理执行过的任务。</p></div>
      <div className="operation-hero-mark"><PalIcon name="logs" /><strong>{operations.length}</strong><small>最近任务</small></div>
    </section>

    <section className="operation-summary" aria-live="polite">
      <div><PalIcon name="server" /><span><strong>{loading ? "正在同步任务日志" : "宿主机任务记录"}</strong><small>{message}</small></span></div>
      <div className="operation-counts"><span className="success"><i />成功 {completed}</span><span className="failed"><i />失败 {failed}</span><button className="button button-secondary" disabled={loading} onClick={() => void refresh()} type="button"><PalIcon name="refresh" />刷新</button></div>
    </section>

    <section className="operation-panel" aria-labelledby="operation-list-title">
      <header className="operation-heading"><div><p className="eyebrow">TASK TIMELINE</p><h2 id="operation-list-title">任务历史</h2></div><div aria-label="日志筛选" className="operation-filter"><button aria-pressed={filter === "all"} className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")} type="button">全部</button><button aria-pressed={filter === "server"} className={filter === "server" ? "active" : ""} onClick={() => setFilter("server")} type="button">服务器</button><button aria-pressed={filter === "backup"} className={filter === "backup" ? "active" : ""} onClick={() => setFilter("backup")} type="button">存档</button></div></header>
      {visible.length ? <div className="operation-list">{visible.map((operation) => <details className={`operation-record ${operation.status}`} key={operation.id}><summary><span className="operation-status"><i /><b>{operation.status === "running" ? "执行中" : operation.status === "success" ? "已完成" : "失败"}</b></span><span className="operation-name"><strong>{operation.label}</strong><small>{formatTime(operation.started_at)} · {duration(operation)}</small></span><span className="operation-result">{operation.messages.at(-1) || "等待任务输出…"}</span></summary><div className="operation-output"><div><span>开始</span><time dateTime={operation.started_at}>{formatTime(operation.started_at)}</time><span>结束</span><time dateTime={operation.finished_at ?? undefined}>{formatTime(operation.finished_at)}</time></div><pre>{operation.messages.length ? operation.messages.join("\n") : "任务尚未输出日志。"}</pre></div></details>)}</div> : <div className="operation-empty"><PalIcon name="logs" /><strong>{loading ? "正在读取日志…" : "还没有任务记录"}</strong><span>{filter === "all" ? "从面板启动、更新、备份或恢复一次服务器后，这里会保留执行过程。" : "当前筛选条件下没有任务记录。"}</span></div>}
    </section>
  </main>;
}

import { useCallback, useEffect, useState } from "react";
import SettingsPanel from "./SettingsPanel";
import BackupPanel from "./BackupPanel";
import { PalIcon, type PalIconName } from "./PalIcons";
import ThemeToggle from "./ThemeToggle";
import "./dashboard-overrides.css";

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
  if (new URLSearchParams(location.search).get("view") === "settings") return <SettingsPanel />;
  if (new URLSearchParams(location.search).get("view") === "backups") return <BackupPanel />;

  const [overview, setOverview] = useState(empty);
  const [host, setHost] = useState(disconnectedHost);
  const [busy, setBusy] = useState(true);

  const refresh = useCallback(async () => {
    setBusy(true);
    const [overviewResult, hostResult] = await Promise.allSettled([
      fetch("/api/server/overview"),
      fetch("/api/host/status"),
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
    setBusy(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  const native = nativeService(host);
  const restLabel = overview.status === "online" ? "REST 已连接" : overview.status === "demo" ? "演示模式" : "REST 未连接";

  return <div className="shell">
    <aside>
      <div className="brand"><b className="brand-mark"><PalIcon name="sphere" /></b><span><strong>PALWORLD</strong><small>SERVER MANAGER</small></span></div>
      <nav>
        <button aria-current="page" className="active"><PalIcon className="nav-icon" name="dashboard" /><span>指挥台</span></button>
        <button><PalIcon className="nav-icon" name="server" /><span>服务器</span></button>
        <button><PalIcon className="nav-icon" name="trainers" /><span>训练家</span></button>
        <button onClick={() => { location.href = "?view=backups"; }}><PalIcon className="nav-icon" name="backup" /><span>存档与备份</span></button>
        <button onClick={() => { location.href = "?view=settings"; }}><PalIcon className="nav-icon" name="settings" /><span>世界规则与安装</span></button>
      </nav>
      <footer>原生 SteamCMD · Docker 面板</footer>
    </aside>
    <main id="main">
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
        <button className="service-settings" onClick={() => { location.href = "?view=settings"; }}>服务器设置</button>
      </section>

      <section className="metrics">
        <Metric icon="trainers" l="在线训练家" v={`${overview.metrics.current_players}/${overview.metrics.max_players || "—"}`} d="当前在线玩家" />
        <Metric icon="pulse" l="服务器帧率" v={`${overview.metrics.server_fps.toFixed(0)} FPS`} d={`${overview.metrics.frame_time_ms.toFixed(1)} ms 每帧`} />
        <Metric icon="sphere" l="世界进程" v={`第 ${overview.metrics.world_days} 天`} d={`${overview.metrics.base_camps} 座基地`} />
        <Metric icon="server" l="原生服务" v={native.label} d={host.agent_connected ? "宿主机代理已连接" : "等待宿主机代理"} />
      </section>

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
    </main>
  </div>;
}

function Metric({ icon, l, v, d }: { icon: PalIconName; l: string; v: string; d: string }) {
  return <article className="card"><PalIcon className="metric-icon" name={icon} /><p>{l}</p><strong>{v}</strong><small>{d}</small></article>;
}

import { useCallback, useEffect, useState } from "react";
import { PalIcon } from "./PalIcons";
import PlayerDetailsDialog from "./PlayerDetailsDialog";
import ThemeToggle from "./ThemeToggle";
import type { OnlinePlayer } from "./onlinePlayer";
import "./game-management.css";

type Overview = { status: "online" | "offline" | "demo"; message: string; server: { name: string; version: string }; metrics: { current_players: number; max_players: number; server_fps: number }; players: OnlinePlayer[] };
type Pending = { kind: "kick" | "ban"; player: OnlinePlayer } | { kind: "unban"; userId: string };

const empty: Overview = { status: "offline", message: "正在连接 Palworld REST API…", server: { name: "未连接服务器", version: "—" }, metrics: { current_players: 0, max_players: 0, server_fps: 0 }, players: [] };

export default function GameManagementPanel() {
  const [overview, setOverview] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"announce" | "save" | "kick" | "ban" | "unban" | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [reason, setReason] = useState("请遵守服务器规则。");
  const [unbanId, setUnbanId] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<OnlinePlayer | null>(null);
  const [feedback, setFeedback] = useState("可通过本页发送公告、保存世界或管理在线训练家。管理员密码始终只保留在面板服务端。");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/server/overview");
      const data = await response.json() as Overview;
      if (!response.ok) throw new Error("无法读取游戏服务器状态。");
      setOverview(data);
    } catch (error) {
      setOverview({ ...empty, message: error instanceof Error ? error.message : "无法读取游戏服务器状态。" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const request = async (kind: NonNullable<typeof busy>, body?: object) => {
    setBusy(kind);
    try {
      const response = await fetch(`/api/game/${kind}`, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json().catch(() => null) as { message?: string; detail?: string } | null;
      if (!response.ok) throw new Error(data?.detail || data?.message || "游戏服务器未完成操作。");
      setFeedback(data?.message || "游戏服务器已接收操作。");
      if (kind === "announce") setAnnouncement("");
      if (kind === "kick" || kind === "ban" || kind === "unban") await refresh();
    } catch (error) {
      setFeedback(`操作失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setBusy(null);
    }
  };

  const available = overview.status === "online" && !loading;
  const confirmation = pending?.kind === "kick" ? "确认踢出训练家？" : pending?.kind === "ban" ? "确认封禁训练家？" : "确认解除封禁？";
  const confirmationDetail = pending?.kind === "kick" ? "该训练家会立即断开连接，但仍可再次进入服务器。" : pending?.kind === "ban" ? "该训练家会立即断开连接，并被加入服务器封禁列表。" : "会移除该 Steam 用户 ID 的服务器封禁记录。";

  return <div className="game-page">
    <div className="settings-toolbar"><div className="crumb">服务器管理　/　<strong>游戏内管理</strong></div><ThemeToggle /></div>
    <section className="game-hero" aria-labelledby="game-title"><div><p className="eyebrow">PALWORLD REST API · LIVE CONTROL</p><h1 id="game-title">游戏内管理</h1><p>向在线训练家发送公告、立即保存世界，并通过官方 REST API 执行踢出、封禁或解除封禁。</p><small>{overview.server.name} · {overview.server.version}</small></div><div className={`game-state ${available ? "online" : "offline"}`}><i /><strong>{available ? "REST 已连接" : overview.status === "demo" ? "演示模式" : "REST 未连接"}</strong><small>{overview.metrics.current_players}/{overview.metrics.max_players || "—"} 训练家 · {overview.metrics.server_fps.toFixed(0)} FPS</small></div></section>

    <section className={`game-feedback ${feedback.startsWith("操作失败") ? "error" : ""}`} aria-live="polite"><PalIcon name="server" /><span><strong>{busy ? "正在向游戏服务器发送操作…" : "游戏控制台"}</strong><small>{feedback || overview.message}</small></span><button className="button button-secondary" disabled={loading || busy !== null} onClick={() => void refresh()} type="button"><PalIcon name="refresh" />刷新状态</button></section>

    <section className="game-grid" aria-label="游戏服务器控制">
      <article className="game-card game-announcement"><p className="eyebrow">SERVER ANNOUNCEMENT</p><h2>全服公告</h2><p>所有在线训练家都会在游戏内收到此消息。</p><textarea disabled={!available || busy !== null} maxLength={280} onChange={(event) => setAnnouncement(event.target.value)} placeholder="例如：服务器将在 10 分钟后进行维护，请尽快返回安全地点。" value={announcement} /><div><small>{announcement.length}/280</small><button className="button button-primary" disabled={!available || busy !== null || !announcement.trim()} onClick={() => void request("announce", { message: announcement })} type="button">{busy === "announce" ? "正在发送…" : "发送公告"}</button></div></article>
      <article className="game-card game-save"><p className="eyebrow">WORLD PERSISTENCE</p><h2>立即保存世界</h2><p>请求游戏服务立刻写入当前世界状态，不创建面板备份，也不会停止服务器。</p><button className="button button-secondary" disabled={!available || busy !== null} onClick={() => void request("save")} type="button"><PalIcon name="backup" />{busy === "save" ? "正在保存…" : "保存世界"}</button></article>
    </section>

    <section className="game-card game-players" aria-labelledby="game-players-title"><header><div><p className="eyebrow">LIVE TRAINERS</p><h2 id="game-players-title">在线训练家</h2><p>可查看 Steam 用户 ID、脱敏 IP 与当前位置；踢出与封禁会要求再次确认。</p></div><strong>{overview.players.length} 人在线</strong></header>{overview.players.length ? <div className="game-player-list">{overview.players.map((player) => <article key={player.player_id}><div className="game-player-avatar">{player.name.slice(0, 1)}</div><div className="game-player-info"><strong>{player.name}</strong><small>@{player.account_name} · {player.player_id}</small></div><div className="game-player-meta"><span>Lv. {player.level}</span><span>{player.ping.toFixed(0)} ms</span><span>{player.building_count} 建造物</span></div><div className="game-player-actions"><button className="button button-secondary" onClick={() => setSelectedPlayer(player)} type="button">详情</button><button className="button button-secondary" disabled={!available || busy !== null || player.user_id === "—"} onClick={() => { setReason("请遵守服务器规则。"); setPending({ kind: "kick", player }); }} type="button">踢出</button><button className="button button-danger" disabled={!available || busy !== null || player.user_id === "—"} onClick={() => { setReason("请遵守服务器规则。"); setPending({ kind: "ban", player }); }} type="button">封禁</button></div></article>)}</div> : <div className="game-empty"><PalIcon name="trainers" /><strong>{loading ? "正在读取在线训练家…" : "当前没有训练家在线"}</strong><span>{overview.message}</span></div>}</section>

    <section className="game-card game-unban"><div><p className="eyebrow">BAN LIST</p><h2>解除封禁</h2><p>官方 REST API 不提供封禁列表查询。请输入要解除封禁的 Steam 用户 ID。</p></div><label>Steam 用户 ID<input autoComplete="off" disabled={!available || busy !== null} maxLength={128} onChange={(event) => setUnbanId(event.target.value)} placeholder="steam_00000000000000000" value={unbanId} /></label><button className="button button-secondary" disabled={!available || busy !== null || !unbanId.trim()} onClick={() => setPending({ kind: "unban", userId: unbanId.trim() })} type="button">解除封禁</button></section>

    {pending && <div aria-labelledby="game-confirmation-title" aria-modal="true" className="confirmation-scrim" role="dialog"><section className="confirmation-dialog game-confirmation"><p className="eyebrow">CONFIRM GAME OPERATION</p><h2 id="game-confirmation-title">{confirmation}</h2><p>{confirmationDetail}</p>{pending.kind !== "unban" && <label className="backup-name-field">显示给训练家的消息<textarea autoFocus maxLength={280} onChange={(event) => setReason(event.target.value)} value={reason} /></label>}<dl><div><dt>{pending.kind === "unban" ? "Steam 用户 ID" : "训练家"}</dt><dd>{pending.kind === "unban" ? pending.userId : `${pending.player.name} · ${pending.player.user_id}`}</dd></div></dl><div className="dialog-actions"><button autoFocus className="button button-secondary" onClick={() => setPending(null)} type="button">取消</button><button className={pending.kind === "ban" ? "button button-danger" : "button button-primary"} disabled={busy !== null || pending.kind !== "unban" && !reason.trim()} onClick={() => { const current = pending; setPending(null); void request(current.kind, current.kind === "unban" ? { user_id: current.userId } : { user_id: current.player.user_id, message: reason }); }} type="button">{pending.kind === "kick" ? "确认踢出" : pending.kind === "ban" ? "确认封禁" : "确认解除封禁"}</button></div></section></div>}
    {selectedPlayer && <PlayerDetailsDialog onClose={() => setSelectedPlayer(null)} player={selectedPlayer} />}
  </div>;
}

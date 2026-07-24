import { useEffect, useState } from "react";
import type { OnlinePlayer } from "./onlinePlayer";
import "./player-details.css";
import "./player-details-overrides.css";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("浏览器不允许复制。");
}

function coordinate(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : "—";
}

export default function PlayerDetailsDialog({ player, onClose }: { player: OnlinePlayer; onClose: () => void }) {
  const [feedback, setFeedback] = useState("可复制 Steam 用户 ID 或玩家 ID 用于服务器管理。");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const copy = async (label: string, value: string) => {
    try {
      await copyText(value);
      setFeedback(`${label} 已复制。`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "复制失败，请手动复制。");
    }
  };

  const canLocate = Number.isFinite(player.location_x) && Number.isFinite(player.location_y);
  const openMap = () => {
    const query = new URLSearchParams({
      trainer: player.name,
      x: String(player.location_x),
      y: String(player.location_y),
    });
    location.href = `?view=map&${query.toString()}`;
  };

  return <div aria-labelledby="player-details-title" aria-modal="true" className="player-details-scrim" role="dialog">
    <section className="player-details-dialog">
      <header><div><p className="eyebrow">LIVE TRAINER · DETAILS</p><h2 id="player-details-title">{player.name}</h2><p>@{player.account_name}</p></div><span>Lv. {player.level}</span></header>
      <dl className="player-details-grid">
        <div><dt>Steam 用户 ID</dt><dd><code>{player.user_id}</code><button aria-label="复制 Steam 用户 ID" disabled={player.user_id === "—"} onClick={() => void copy("Steam 用户 ID", player.user_id)} type="button">复制</button></dd></div>
        <div><dt>玩家 ID</dt><dd><code>{player.player_id}</code><button aria-label="复制玩家 ID" disabled={player.player_id === "—"} onClick={() => void copy("玩家 ID", player.player_id)} type="button">复制</button></dd></div>
        <div><dt>连接 IP</dt><dd><code>{player.ip_address}</code></dd></div>
        <div><dt>延迟</dt><dd>{player.ping.toFixed(0)} ms</dd></div>
        <div><dt>当前位置 X / Y</dt><dd><code>{coordinate(player.location_x)} / {coordinate(player.location_y)}</code><button aria-label="复制当前坐标" onClick={() => void copy("当前坐标", `${coordinate(player.location_x)}, ${coordinate(player.location_y)}`)} type="button">复制</button></dd></div>
        <div><dt>拥有建造物</dt><dd>{player.building_count} 个</dd></div>
      </dl>
      <button className="player-details-map" disabled={!canLocate} onClick={openMap} type="button">在世界地图定位</button>
      <p aria-live="polite" className="player-details-feedback">{feedback}</p>
      <p className="player-details-privacy">{player.ip_address === "游戏接口未提供" ? "当前帕鲁服务端没有返回该训练家的 IP；面板不会尝试从其他渠道收集它。" : "连接 IP 已由面板脱敏；完整 IP 不会发送到浏览器。"}</p>
      <footer><button autoFocus className="button button-secondary" onClick={onClose} type="button">关闭详情</button></footer>
    </section>
  </div>;
}

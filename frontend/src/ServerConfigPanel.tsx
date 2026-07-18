import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { PalIcon } from "./PalIcons";

type ServerConfig = {
  server_name: string; server_description: string; server_password: string; admin_password: string;
  server_player_max_num: number; rest_api_port: number; backup_save_data: boolean;
  exp_rate: number; pal_capture_rate: number; pal_spawn_num_rate: number;
  day_time_speed_rate: number; night_time_speed_rate: number;
  death_penalty: "None" | "Item" | "ItemAndEquipment" | "All";
};

type LoadedConfig = Omit<ServerConfig, "server_password" | "admin_password"> & {
  server_password_set: boolean; admin_password_set: boolean; file_exists: boolean;
};

const defaults: ServerConfig = {
  server_name: "Default Palworld Server", server_description: "", server_password: "", admin_password: "",
  server_player_max_num: 32, rest_api_port: 8212, backup_save_data: true,
  exp_rate: 1, pal_capture_rate: 1, pal_spawn_num_rate: 1, day_time_speed_rate: 1, night_time_speed_rate: 1,
  death_penalty: "All",
};

export default function ServerConfigPanel({ disabled, restPasswordReady, onSaved }: { disabled: boolean; restPasswordReady: boolean; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState(defaults);
  const [passwords, setPasswords] = useState({ server: false, admin: false });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("连接宿主机代理后，可读取并编辑 PalWorldSettings.ini。");
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (disabled) return;
    setLoading(true); setError(false);
    try {
      const response = await fetch("/api/server/config");
      const data = await response.json() as { ok: boolean; message: string; config?: LoadedConfig };
      if (!response.ok || !data.ok || !data.config) throw new Error(data.message || "无法读取服务器配置");
      const { server_password_set, admin_password_set, file_exists: _fileExists, ...config } = data.config;
      setValues({ ...config, server_password: "", admin_password: "" });
      setPasswords({ server: server_password_set, admin: admin_password_set });
      setMessage(data.message);
    } catch (reason) {
      setError(true);
      setMessage(reason instanceof Error ? reason.message : "无法读取服务器配置，请检查宿主机代理版本。");
    } finally { setLoading(false); }
  }, [disabled]);

  useEffect(() => { void load(); }, [load]);

  const text = (key: "server_name" | "server_description" | "server_password" | "admin_password") => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
  };
  const number = (key: "server_player_max_num" | "rest_api_port" | "exp_rate" | "pal_capture_rate" | "pal_spawn_num_rate" | "day_time_speed_rate" | "night_time_speed_rate") => (event: ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [key]: Number(event.target.value) }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(false);
    try {
      const response = await fetch("/api/server/config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, server_password: values.server_password || null, admin_password: values.admin_password || null }),
      });
      const data = await response.json() as { ok?: boolean; message?: string; detail?: string; restart_required?: boolean };
      if (!response.ok || !data.ok) throw new Error(data.detail || data.message || "保存失败");
      setPasswords((current) => ({ server: current.server || Boolean(values.server_password), admin: current.admin || Boolean(values.admin_password) }));
      setValues((current) => ({ ...current, server_password: "", admin_password: "" }));
      setMessage(`${data.message ?? "服务器配置已保存。"}${data.restart_required ? " 请使用上方“重启”使配置生效。" : ""}`);
      await onSaved().catch(() => undefined);
    } catch (reason) {
      setError(true); setMessage(reason instanceof Error ? reason.message : "服务器配置保存失败。");
    } finally { setSaving(false); }
  };

  const unavailable = disabled || loading || saving;
  return <section className="settings-card server-config-card" aria-labelledby="server-config-title">
    <div className="settings-card-heading">
      <div><p className="eyebrow">WORLD & REST API</p><h2 id="server-config-title">服务器配置</h2></div>
      <button className="button button-secondary" disabled={unavailable} onClick={() => void load()} type="button"><PalIcon name="refresh" />{loading ? "读取中…" : "重新读取"}</button>
    </div>
    <p className={`config-feedback ${error ? "error" : ""}`} role="status">{message}</p>
    <form onSubmit={save}>
      <fieldset disabled={unavailable}>
        <legend>服务器信息</legend>
        <div className="config-fields config-fields-main">
          <label>服务器名称<input maxLength={128} onChange={text("server_name")} required value={values.server_name} /></label>
          <label>最大训练家人数<input max={32} min={1} onChange={number("server_player_max_num")} required type="number" value={values.server_player_max_num} /></label>
          <label className="config-wide">服务器简介<textarea maxLength={512} onChange={text("server_description")} rows={3} value={values.server_description} /></label>
          <label>加入密码<input autoComplete="new-password" onChange={text("server_password")} placeholder={passwords.server ? "已设置；留空保持不变" : "可选"} type="password" value={values.server_password} /></label>
          <label>管理员密码<input autoComplete="new-password" onChange={text("admin_password")} placeholder={restPasswordReady ? "面板已保存；留空保持不变" : passwords.admin ? "服务端已有密码，请重新输入供面板连接" : "首次启用 REST API 时必填"} required={!restPasswordReady} type="password" value={values.admin_password} /></label>
        </div>
      </fieldset>
      <fieldset disabled={unavailable}>
        <legend>接口与存档</legend>
        <p className="field-help">保存时自动启用 REST API、关闭演示模式，并连接官方 <code>/v1/api</code> 接口。请勿将 REST API 端口直接暴露到公网。</p>
        <div className="config-fields">
          <label>REST API 端口<input max={65535} min={1024} onChange={number("rest_api_port")} required type="number" value={values.rest_api_port} /></label>
          <label className="config-switch"><input checked={values.backup_save_data} onChange={(event) => setValues((current) => ({ ...current, backup_save_data: event.target.checked }))} type="checkbox" /><span><strong>启用游戏内世界备份</strong><small>由 Palworld 按官方保留策略生成备份。</small></span></label>
        </div>
      </fieldset>
      <details className="advanced-config">
        <summary>游戏倍率与死亡惩罚</summary>
        <fieldset disabled={unavailable}>
          <div className="config-fields config-rates">
            <label>经验倍率<input max={20} min={0.1} onChange={number("exp_rate")} required step={0.1} type="number" value={values.exp_rate} /></label>
            <label>捕获倍率<input max={20} min={0.1} onChange={number("pal_capture_rate")} required step={0.1} type="number" value={values.pal_capture_rate} /></label>
            <label>帕鲁出现倍率<input max={20} min={0.1} onChange={number("pal_spawn_num_rate")} required step={0.1} type="number" value={values.pal_spawn_num_rate} /></label>
            <label>白天速度<input max={20} min={0.1} onChange={number("day_time_speed_rate")} required step={0.1} type="number" value={values.day_time_speed_rate} /></label>
            <label>夜晚速度<input max={20} min={0.1} onChange={number("night_time_speed_rate")} required step={0.1} type="number" value={values.night_time_speed_rate} /></label>
            <label>死亡惩罚<select onChange={(event) => setValues((current) => ({ ...current, death_penalty: event.target.value as ServerConfig["death_penalty"] }))} value={values.death_penalty}><option value="None">不掉落</option><option value="Item">仅掉落物品</option><option value="ItemAndEquipment">掉落物品与装备</option><option value="All">全部掉落</option></select></label>
          </div>
        </fieldset>
      </details>
      <div className="config-save-row"><span>写入前会自动保留一份带时间戳的配置备份。</span><button className="button button-primary" disabled={unavailable} type="submit">{saving ? "保存中…" : "保存配置并启用 REST API"}</button></div>
    </form>
  </section>;
}

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { PalIcon } from "./PalIcons";
import {
  DEFAULT_SERVER_OPTIONS,
  SERVER_CONFIG_FIELDS,
  SERVER_CONFIG_GROUPS,
  type ConfigField,
  type ConfigGroup,
  type ConfigValue,
} from "./serverConfigFields";

type LoadedConfig = {
  options: Record<string, ConfigValue>;
  passwords: { server: boolean; admin: boolean };
  file_exists: boolean;
  source: "target" | "default-missing" | "default-invalid";
  world_option_exists: boolean;
};

const passwordKey = (key: string) => key === "AdminPassword" ? "admin" : "server";

export default function ServerConfigPanel({ disabled, restPasswordReady, onSaved }: { disabled: boolean; restPasswordReady: boolean; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState<Record<string, ConfigValue>>({ ...DEFAULT_SERVER_OPTIONS });
  const [passwords, setPasswords] = useState({ server: false, admin: false });
  const [activeGroup, setActiveGroup] = useState(SERVER_CONFIG_GROUPS[0].id);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [worldOptionPresent, setWorldOptionPresent] = useState(false);
  const [message, setMessage] = useState("连接宿主机 Agent 后，可读取并编辑 PalWorldSettings.ini。");
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (disabled) return;
    setLoading(true); setError(false);
    try {
      const response = await fetch("/api/server/config");
      const data = await response.json() as { ok: boolean; message: string; config?: LoadedConfig };
      if (!response.ok || !data.ok || !data.config) throw new Error(data.message || "无法读取服务器配置");
      const knownOptions = Object.fromEntries(Object.entries(data.config.options).filter(([key]) => SERVER_CONFIG_FIELDS.some((field) => field.key === key)));
      setValues({ ...DEFAULT_SERVER_OPTIONS, ...knownOptions, ServerPassword: "", AdminPassword: "" });
      setPasswords(data.config.passwords);
      setWorldOptionPresent(data.config.world_option_exists);
      setDirty(false);
      setMessage(data.message);
    } catch (reason) {
      setError(true);
      setMessage(reason instanceof Error ? reason.message : "无法读取服务器配置，请检查宿主机 Agent 版本。");
    } finally { setLoading(false); }
  }, [disabled]);

  useEffect(() => { void load(); }, [load]);

  const setValue = (key: string, value: ConfigValue) => {
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const visibleGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return SERVER_CONFIG_GROUPS.filter((group) => group.id === activeGroup);
    return SERVER_CONFIG_GROUPS.map((group) => ({
      ...group,
      fields: group.fields.filter((field) => `${field.label} ${field.key} ${field.help ?? ""}`.toLowerCase().includes(normalized)),
    })).filter((group) => group.fields.length);
  }, [activeGroup, query]);

  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(false);
    try {
      if (!restPasswordReady && !String(values.AdminPassword ?? "")) {
        throw new Error("首次连接 REST API 时必须输入管理员密码。");
      }
      const options = { ...values };
      if (!String(options.ServerPassword ?? "")) delete options.ServerPassword;
      if (!String(options.AdminPassword ?? "")) delete options.AdminPassword;
      const response = await fetch("/api/server/config", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ options }),
      });
      const data = await response.json() as { ok?: boolean; message?: string; detail?: string; restart_required?: boolean };
      if (!response.ok || !data.ok) throw new Error(data.detail || data.message || "保存失败");
      setPasswords((current) => ({
        server: current.server || Boolean(values.ServerPassword),
        admin: current.admin || Boolean(values.AdminPassword),
      }));
      setValues((current) => ({ ...current, ServerPassword: "", AdminPassword: "" }));
      setDirty(false);
      setMessage(`${data.message ?? "服务器配置已保存。"}${data.restart_required ? " 请使用上方“重启”使配置生效。" : ""}`);
      await onSaved().catch(() => undefined);
    } catch (reason) {
      setError(true); setMessage(reason instanceof Error ? reason.message : "服务器配置保存失败。");
    } finally { setSaving(false); }
  };

  const unavailable = disabled || loading || saving;
  const renderField = (field: ConfigField) => {
    const value = values[field.key] ?? field.defaultValue;
    const help = field.help ? <small className="config-field-help">{field.help}</small> : null;
    const heading = <span className="config-field-heading"><strong>{field.label}</strong><code>{field.key}</code></span>;

    if (field.type === "boolean") {
      return <label className={`config-switch ${field.danger ? "config-danger" : ""}`} key={field.key}>
        <input checked={Boolean(value)} onChange={(event) => setValue(field.key, event.target.checked)} type="checkbox" />
        <span>{heading}{help}</span>
      </label>;
    }
    if (field.type === "multi" && field.options?.length) {
      const selected = Array.isArray(value) ? value : [];
      return <fieldset className="config-multi config-wide" key={field.key}>
        <legend>{heading}</legend>{help}
        <div className="config-choice-grid">{field.options.map((option) => <label key={option.value}>
          <input checked={selected.includes(option.value)} onChange={(event) => setValue(field.key, event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))} type="checkbox" />
          <span>{option.label}</span>
        </label>)}</div>
      </fieldset>;
    }
    if (field.type === "multi") {
      return <label className="config-wide" key={field.key}>{heading}
        <input onChange={(event) => setValue(field.key, event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} placeholder="多个 ID 用英文逗号分隔" value={Array.isArray(value) ? value.join(", ") : ""} />{help}
      </label>;
    }
    if (field.type === "textarea") {
      return <label className="config-wide" key={field.key}>{heading}<textarea maxLength={512} onChange={(event) => setValue(field.key, event.target.value)} rows={3} value={String(value)} />{help}</label>;
    }
    if (field.type === "select") {
      return <label key={field.key}>{heading}<select onChange={(event) => setValue(field.key, event.target.value)} value={String(value)}>
        {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>{help}</label>;
    }
    if (field.type === "password") {
      const kind = passwordKey(field.key);
      const hasPassword = passwords[kind];
      const adminRequired = field.key === "AdminPassword" && !restPasswordReady;
      return <label key={field.key}>{heading}<input autoComplete="new-password" onChange={(event) => setValue(field.key, event.target.value)} placeholder={adminRequired ? "首次连接时必须输入" : hasPassword ? "已设置；留空保持不变" : "未设置"} required={adminRequired} type="password" value={String(value)} />{help}</label>;
    }
    if (field.type === "number") {
      return <label key={field.key}>{heading}<input max={field.max} min={field.min} onChange={(event) => setValue(field.key, event.target.valueAsNumber)} required step={field.step} type="number" value={Number(value)} />{help}</label>;
    }
    return <label className={field.wide ? "config-wide" : ""} key={field.key}>{heading}<input maxLength={256} onChange={(event) => setValue(field.key, event.target.value)} required={field.key === "ServerName"} value={String(value)} />{help}</label>;
  };

  return <section className="settings-card server-config-card" aria-labelledby="server-config-title">
    <div className="settings-card-heading">
      <div><p className="eyebrow">WORLD CONFIGURATION</p><h2 id="server-config-title">服务器配置</h2></div>
      <button className="button button-secondary" disabled={unavailable} onClick={() => void load()} type="button"><PalIcon name="refresh" />{loading ? "读取中…" : "重新读取"}</button>
    </div>
    <p className={`config-feedback ${error ? "error" : ""}`} aria-live="polite">{message}</p>
    {worldOptionPresent && <p className="config-priority-warning"><strong>检测到 WorldOption.sav</strong><span>它可能优先于 PalWorldSettings.ini；若保存后规则未变化，需要同步处理该存档级配置。</span></p>}
    <div className="config-explorer">
      <label className="config-search"><span>搜索配置项</span><div><PalIcon name="search" /><input onChange={(event) => setQuery(event.target.value)} placeholder="输入中文名称或 INI 键，例如 ExpRate" type="search" value={query} /></div></label>
      <nav aria-label="配置分类" className="config-tabs" role="tablist">
        {SERVER_CONFIG_GROUPS.map((group) => <button aria-selected={!query && activeGroup === group.id} className={!query && activeGroup === group.id ? "active" : ""} key={group.id} onClick={() => { setActiveGroup(group.id); setQuery(""); }} role="tab" type="button">
          <span>{group.title}</span><small>{group.fields.length} 项</small>
        </button>)}
      </nav>
    </div>
    <form onSubmit={save}>
      {visibleGroups.length ? visibleGroups.map((group: ConfigGroup) => <section className="config-group" key={group.id}>
        <header><div><p className="eyebrow">{group.eyebrow}</p><h3>{group.title}</h3></div><span>{group.fields.length} 项</span></header>
        <p>{group.description}</p>
        <fieldset className="config-fields config-dynamic-fields" disabled={unavailable}>{group.fields.map(renderField)}</fieldset>
      </section>) : <div className="config-empty"><strong>没有找到匹配的配置项</strong><span>可尝试“倍率”“密码”“PvP”或直接输入 INI 键。</span><button className="button button-secondary" onClick={() => setQuery("")} type="button">清除搜索</button></div>}
      <div className="config-save-row"><span>{dirty ? "有尚未保存的修改。" : `已加载 ${SERVER_CONFIG_FIELDS.length} 个可管理字段。`} 写入前会自动备份原配置；未知字段会原样保留。</span><button className="button button-primary" disabled={unavailable || !visibleGroups.length} type="submit">{saving ? "保存中…" : "保存全部配置并启用 REST API"}</button></div>
    </form>
  </section>;
}

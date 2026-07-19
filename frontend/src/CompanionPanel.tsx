import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PalIcon } from "./PalIcons";
import ThemeToggle from "./ThemeToggle";
import "./companion.css";

type Work = { key: string; name: string; level: number | null };
type Pal = {
  code: string; paldex: number; suffix: string; name: string; name_zh?: string | null; english_name: string;
  types: string[]; work: Work[]; stats: Record<string, number> | null; moves: Array<{ skill: string; level: number }>;
  variant: boolean; boss: boolean; source_url?: string;
};
type Catalog = {
  game_version?: string; pals: Pal[];
  source: { website?: string; dataset_updated?: string; note?: string };
};

const typeNames: Record<string, string> = { neutral: "无", normal: "无", fire: "火", water: "水", electricity: "雷", leaf: "草", ice: "冰", earth: "地", dark: "暗", dragon: "龙" };
const statNames: Record<string, string> = { HP: "生命", ATK: "攻击", DEF: "防御", RUN: "跑速", SPRINT: "冲刺", PRICE: "价格" };
const maps = {
  palworld: { label: "Palworld 1.0", url: "https://wand.com/maps/palworld/palworld-10", description: "帕洛斯群岛与 1.0 区域" },
  worldTree: { label: "世界树", url: "https://wand.com/maps/palworld/world-tree", description: "世界树区域与标记" },
} as const;

function nav(to: string) { location.href = to; }
function displayName(pal: Pal) { return pal.name_zh || pal.name; }
function palNumber(pal: Pal) { return `No.${String(pal.paldex).padStart(3, "0")}${pal.suffix ? ` · ${pal.suffix}` : ""}`; }

function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/companion/pals.json")
      .then((response) => response.ok ? response.json() as Promise<Catalog> : Promise.reject(new Error(String(response.status))))
      .then(setCatalog)
      .catch(() => setError("图鉴资料暂时无法读取。请确认镜像已更新并重新加载页面。"));
  }, []);
  return { catalog, error };
}

function CompanionSidebar({ active }: { active: "paldex" | "map" }) {
  return <aside>
    <div className="brand"><b className="brand-mark"><PalIcon name="sphere" /></b><span><strong>PALWORLD</strong><small>SERVER MANAGER</small></span></div>
    <nav>
      <button onClick={() => nav("/")}><PalIcon className="nav-icon" name="dashboard" /><span>指挥台</span></button>
      <button className={active === "paldex" ? "active" : ""} aria-current={active === "paldex" ? "page" : undefined} onClick={() => nav("?view=paldex")}><PalIcon className="nav-icon" name="paldex" /><span>帕鲁图鉴</span></button>
      <button className={active === "map" ? "active" : ""} aria-current={active === "map" ? "page" : undefined} onClick={() => nav("?view=map")}><PalIcon className="nav-icon" name="map" /><span>世界地图</span></button>
      <button onClick={() => nav("?view=backups")}><PalIcon className="nav-icon" name="backup" /><span>存档与备份</span></button>
      <button onClick={() => nav("?view=operations")}><PalIcon className="nav-icon" name="logs" /><span>运行日志</span></button>
      <button onClick={() => nav("?view=settings")}><PalIcon className="nav-icon" name="settings" /><span>世界规则与安装</span></button>
    </nav>
    <footer>资料库 · 图鉴快照与互动地图</footer>
  </aside>;
}

function CompanionHeader({ crumb, action }: { crumb: string; action?: ReactNode }) {
  return <header className="companion-header"><div className="crumb">世界资料　/　<strong>{crumb}</strong></div><div className="pal-header-actions">{action}<ThemeToggle /></div></header>;
}

function TypeBadge({ type }: { type: string }) { return <span className={`type-badge ${type}`}>{typeNames[type] ?? type}</span>; }

export default function CompanionPanel({ view }: { view: "paldex" | "map" }) {
  const { catalog, error } = useCatalog();
  return <div className="shell"><CompanionSidebar active={view} /><main className="companion-main" id="main">
    {view === "paldex" ? <Paldex catalog={catalog} error={error} /> : <WorldMap />}
  </main></div>;
}

function Paldex({ catalog, error }: { catalog: Catalog | null; error: string }) {
  const initial = new URLSearchParams(location.search).get("pal") ?? null;
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [work, setWork] = useState("all");
  const [selectedCode, setSelectedCode] = useState<string | null>(initial);
  const pals = catalog?.pals ?? [];
  const types = useMemo(() => [...new Set(pals.flatMap((pal) => pal.types))].sort(), [pals]);
  const works = useMemo(() => [...new Map(pals.flatMap((pal) => pal.work).map((item) => [item.key, item])).values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")), [pals]);
  const filtered = useMemo(() => pals.filter((pal) => {
    const needle = query.trim().toLocaleLowerCase();
    return (!needle || `${displayName(pal)} ${pal.name} ${pal.english_name} ${pal.code} ${pal.paldex}`.toLocaleLowerCase().includes(needle))
      && (type === "all" || pal.types.includes(type))
      && (work === "all" || pal.work.some((item) => item.key === work));
  }), [pals, query, type, work]);
  const selected = pals.find((pal) => pal.code === selectedCode) ?? filtered[0] ?? null;

  return <><CompanionHeader crumb="帕鲁图鉴" action={<span className="companion-count"><PalIcon name="paldex" />{pals.length || "—"} 条 · {catalog?.game_version ?? "最新"}</span>} />
    <section className="companion-hero panel"><div><p className="eyebrow">PALDECK · CURRENT GAME INDEX</p><h1>帕鲁图鉴</h1><p>内置当前公开索引快照，可按元素、工作适性及名称筛选；每条资料可跳转至来源页查看持续更新的详情。</p></div><div className="companion-hero-mark"><PalIcon name="paldex" /><small>{catalog?.source.dataset_updated ? `INDEX · ${catalog.source.dataset_updated}` : "资料数据可追溯"}</small></div></section>
    {error ? <section className="companion-error">{error}</section> : !catalog ? <section className="companion-loading">正在装载图鉴资料…</section> : <>
      <section className="paldex-tools panel" aria-label="图鉴筛选">
        <label className="companion-search"><PalIcon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索中文名、英文名、图鉴编号或内部编号" /></label>
        <label>元素<select value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部元素</option>{types.map((item) => <option key={item} value={item}>{typeNames[item] ?? item}</option>)}</select></label>
        <label>工作<select value={work} onChange={(event) => setWork(event.target.value)}><option value="all">全部工作</option>{works.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
        <strong>{filtered.length} <small>/ {pals.length}</small></strong>
      </section>
      <section className="paldex-layout">
        <div className="paldex-grid" aria-live="polite">{filtered.map((pal) => <button className={`pal-card ${selected?.code === pal.code ? "selected" : ""}`} key={pal.code} onClick={() => setSelectedCode(pal.code)}>
          <span className="pal-monogram">{displayName(pal).slice(0, 1)}</span><span className="pal-card-main"><strong>{displayName(pal)}</strong><small>{pal.name}</small><span>{pal.types.map((item) => <TypeBadge key={item} type={item} />)}</span></span><em>{palNumber(pal)} · {pal.work.length} 项工作</em>
        </button>)}</div>
        <PalDetail pal={selected} />
      </section>
    </>}
  </>;
}

function PalDetail({ pal }: { pal: Pal | null }) {
  if (!pal) return <aside className="pal-detail panel"><p className="eyebrow">PAL PROFILE</p><h2>没有匹配的帕鲁</h2><p>换一个关键词或放宽筛选条件。</p></aside>;
  return <aside className="pal-detail panel"><p className="eyebrow">PAL PROFILE · {palNumber(pal)}</p><div className="pal-detail-title"><span className="pal-monogram large">{displayName(pal).slice(0, 1)}</span><div><h2>{displayName(pal)}</h2><small>{pal.name} · {pal.code}</small></div></div><div className="detail-types">{pal.types.map((item) => <TypeBadge key={item} type={item} />)}</div>
    <section><h3>工作适性</h3>{pal.work.length ? <div className="work-chips">{pal.work.map((item) => <span key={item.key}>{item.name}{item.level !== null && <b>Lv.{item.level}</b>}</span>)}</div> : <p className="muted">当前索引未提供工作适性。</p>}</section>
    <section><h3>基础数值</h3>{pal.stats ? <dl className="stat-list">{Object.entries(pal.stats).filter(([, value]) => Number.isFinite(value)).map(([key, value]) => <div key={key}><dt>{statNames[key] ?? key}</dt><dd>{value}</dd></div>)}</dl> : <p className="muted">当前索引未提供基础数值。</p>}</section>
    <section><h3>更多资料</h3><p className="muted">招式等级与完整掉落信息以资料源页面为准，避免在面板中保留过期副本。</p></section>
    <button className="button-secondary companion-link" onClick={() => nav("?view=map")}><PalIcon name="map" />打开互动地图</button>
    <a className="button-primary companion-link source-link" href={pal.source_url ?? "https://www.palworld.tools/pals"} target="_blank" rel="noreferrer">查看资料源详情</a>
  </aside>;
}

function WorldMap() {
  const [mapId, setMapId] = useState<keyof typeof maps>("palworld");
  const [loaded, setLoaded] = useState(false);
  const selected = maps[mapId];
  useEffect(() => setLoaded(false), [mapId]);

  return <><CompanionHeader crumb="世界地图" action={<a className="refresh external-map-link" href={selected.url} target="_blank" rel="noreferrer"><PalIcon name="map" /><span>在 Wand 打开</span></a>} />
    <section className="companion-hero panel map-hero"><div><p className="eyebrow">WORLD MAP · THIRD-PARTY INTERACTIVE</p><h1>世界地图</h1><p>内置 Wand 维护的互动地图。地图内可自行搜索帕鲁、资源和传送点；数据与标记更新由地图来源直接维护。</p></div><div className="companion-hero-mark"><PalIcon name="map" /><small>互动地图 · 实时来源</small></div></section>
    <section className="map-layout">
      <section className="world-map panel">
        <div className="map-toolbar"><label>地图区域<select value={mapId} onChange={(event) => setMapId(event.target.value as keyof typeof maps)}>{Object.entries(maps).map(([key, map]) => <option key={key} value={key}>{map.label} · {map.description}</option>)}</select></label><a href={selected.url} target="_blank" rel="noreferrer" className="map-source-link">无法载入？在新标签页打开</a></div>
        <div className="embed-map-shell" aria-busy={!loaded}>
          {!loaded && <div className="embed-map-loading"><PalIcon name="map" /><strong>正在加载 {selected.label} 互动地图…</strong><small>首次加载取决于 Wand 的地图服务。</small></div>}
          <iframe key={mapId} className="third-party-map" title={`${selected.label} - Wand 互动地图`} src={selected.url} loading="lazy" allow="clipboard-write" referrerPolicy="strict-origin-when-cross-origin" onLoad={() => setLoaded(true)} />
        </div>
        <footer className="map-foot"><span><i />数据与地图标记由 Wand 维护</span><small>地图在独立站点运行，面板不会读取你的地图操作或账号信息。</small></footer>
      </section>
      <aside className="map-info panel"><p className="eyebrow">MAP SOURCE</p><div className="pal-detail-title"><span className="pal-monogram large"><PalIcon name="map" /></span><div><h2>{selected.label}</h2><small>Wand 互动地图</small></div></div><dl><div><dt>覆盖区域</dt><dd>{selected.description}</dd></div><div><dt>嵌入方式</dt><dd>第三方 iframe</dd></div><div><dt>标记数据</dt><dd>来源站点维护</dd></div></dl><a className="button-primary companion-link source-link" href={selected.url} target="_blank" rel="noreferrer">在 Wand 完整打开</a><p className="map-source">若网络策略阻止嵌入，请使用上方链接。该地图不是服务器实时状态，也不会改动你的游戏世界。</p></aside>
    </section>
  </>;
}

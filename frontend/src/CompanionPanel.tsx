import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
import { PalIcon } from "./PalIcons";
import ThemeToggle from "./ThemeToggle";
import "./companion.css";

type Work = { key: string; name: string; level: number | null };
type PalMove = { id?: string; skill?: string; name?: string; level: number; element?: string | null; power?: number | null; cooldown?: number | null; type?: string | null; range?: { min: number | null; max: number | null } | null; description?: string | null };
type Breeding = { as_child?: [string, string][]; as_parent?: Array<{ mateId: string; childId: string }> };
type Pal = {
  code: string; paldex: number; suffix: string; name: string; name_zh?: string | null; english_name: string;
  types: string[]; work: Work[]; stats: Record<string, number> | null; movement?: Record<string, number> | null; moves?: PalMove[];
  drops?: Array<{ item: string; quantity?: string | null; probability?: string | null }>; habitat?: { status?: string | null; source?: string | null; tabs?: Array<{ label: string; count: number; regions: Array<{ name: string; count: number }> }> }; breeding?: Breeding;
  variant: boolean; boss: boolean; icon?: string; partner_skill?: string | null; partner_skill_description?: string | null; partner_skill_effects?: Array<{ level: number; effects: Array<{ effect: string; value: string | number; target: string }> }>; description?: string | null; source_url?: string;
};
type Catalog = {
  game_version?: string; pals: Pal[];
  source: { provider?: string; website?: string; dataset?: string; dataset_updated?: string; note?: string };
};
type MapCategory = { id: number; group: string; name: string; icon?: string };
type Landmark = { id: number; category_id: number; category: string; group: string; name: string; description: string; x: number; y: number; z?: number };
type MapCatalog = {
  name: string; generated_at?: string;
  source: { provider?: string; website?: string; updated_at?: string; note?: string };
  bounds: { west: number; east: number; south: number; north: number };
  tile: { zoom: number; size: number; xStart: number; xEnd: number; yStart: number; yEnd: number; path: string };
  categories: MapCategory[]; areas: Array<{ name: string; x: number; y: number }>; landmarks: Landmark[];
};

const typeNames: Record<string, string> = { neutral: "无", normal: "无", fire: "火", water: "水", electricity: "雷", leaf: "草", ice: "冰", earth: "地", dark: "暗", dragon: "龙" };
const statNames: Record<string, string> = { HP: "生命", ATK: "近战攻击", SHOT: "射击攻击", DEF: "防御", WORK_SPEED: "工作速度", CAPTURE_RATE: "捕捉率", RARITY: "稀有度", FOOD: "进食量", RUN: "跑速", SPRINT: "冲刺", PRICE: "价格", WALK: "步行速度", SWIM: "游泳速度", STAMINA: "耐力", RIDE_SPRINT: "骑乘冲刺", TRANSPORT: "搬运速度" };
const moveTypeNames: Record<string, string> = { Shot: "远程", Melee: "近战" };
function nav(to: string) { location.href = to; }
function displayName(pal: Pal) { return pal.name_zh || pal.name; }
function palNumber(pal: Pal) { return `No.${String(pal.paldex).padStart(3, "0")}${pal.suffix ? ` · ${pal.suffix}` : ""}`; }

function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/data/palworld/pals.json")
      .then((response) => response.ok ? response.json() as Promise<Catalog> : Promise.reject(new Error(String(response.status))))
      .then(setCatalog)
      .catch(() => setError("图鉴资料暂时无法读取。请确认镜像已更新并重新加载页面。"));
  }, []);
  return { catalog, error };
}

function useMapCatalog() {
  const [map, setMap] = useState<MapCatalog | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/data/palworld/map/map.json")
      .then((response) => response.ok ? response.json() as Promise<MapCatalog> : Promise.reject(new Error(String(response.status))))
      .then(setMap)
      .catch(() => setError("离线地图资料暂时无法读取。请确认镜像已更新并重新加载页面。"));
  }, []);
  return { map, error };
}

function PalAvatar({ pal, large = false }: { pal: Pal; large?: boolean }) {
  const fallback = displayName(pal).slice(0, 1);
  return <span className={`pal-avatar ${large ? "large" : ""}`}>
    <span aria-hidden="true">{fallback}</span>
    {pal.icon && <img src={pal.icon} alt={`${displayName(pal)}头像`} width={large ? 52 : 39} height={large ? 52 : 39} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}
  </span>;
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

export default function CompanionPanel({ view }: { view: "paldex" | "paldex-detail" | "map" }) {
  const { catalog, error } = useCatalog();
  return <div className="shell"><CompanionSidebar active={view === "map" ? "map" : "paldex"} /><main className="companion-main" id="main">
    {view === "map" ? <WorldMap /> : view === "paldex-detail" ? <PaldexDetailPage catalog={catalog} error={error} /> : <Paldex catalog={catalog} error={error} />}
  </main></div>;
}

function Paldex({ catalog, error }: { catalog: Catalog | null; error: string }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [work, setWork] = useState("all");
  const pals = catalog?.pals ?? [];
  const types = useMemo(() => [...new Set(pals.flatMap((pal) => pal.types))].sort(), [pals]);
  const works = useMemo(() => [...new Map(pals.flatMap((pal) => pal.work).map((item) => [item.key, item])).values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")), [pals]);
  const filtered = useMemo(() => pals.filter((pal) => {
    const needle = query.trim().toLocaleLowerCase();
    return (!needle || `${displayName(pal)} ${pal.name} ${pal.english_name} ${pal.code} ${pal.paldex}`.toLocaleLowerCase().includes(needle))
      && (type === "all" || pal.types.includes(type))
      && (work === "all" || pal.work.some((item) => item.key === work));
  }), [pals, query, type, work]);

  return <><CompanionHeader crumb="帕鲁图鉴" action={<><span className="companion-count"><PalIcon name="paldex" />{pals.length || "—"} 条 · {catalog?.game_version ?? "最新"}</span><span className="data-source-mark">资料来源 · {catalog?.source.provider ?? "游民星空"}</span></>} />
    <section className="companion-hero panel"><div><p className="eyebrow">PALDECK · OFFLINE DATA SNAPSHOT</p><h1>帕鲁图鉴</h1><p>内置最新中文图鉴、头像、工作适性、伙伴技能与招式快照；可按元素、工作适性及名称筛选，运行时无需访问第三方站点。</p><p className="source-caption">图鉴资料来源：{catalog?.source.provider ?? "游民星空"}</p></div><div className="companion-hero-mark"><PalIcon name="paldex" /><small>{catalog?.source.dataset_updated ? `INDEX · ${catalog.source.dataset_updated}` : "本地图鉴快照"}</small></div></section>
    {error ? <section className="companion-error">{error}</section> : !catalog ? <section className="companion-loading">正在装载图鉴资料…</section> : <>
      <section className="paldex-tools panel" aria-label="图鉴筛选">
        <label className="companion-search"><PalIcon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索中文名、英文名、图鉴编号或内部编号" /></label>
        <label>元素<select value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部元素</option>{types.map((item) => <option key={item} value={item}>{typeNames[item] ?? item}</option>)}</select></label>
        <label>工作<select value={work} onChange={(event) => setWork(event.target.value)}><option value="all">全部工作</option>{works.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
        <strong>{filtered.length} <small>/ {pals.length}</small></strong>
      </section>
      <section className="paldex-catalog" aria-label="帕鲁图鉴列表">
        <div className="paldex-grid" aria-live="polite">{filtered.map((pal) => <button className="pal-card" key={pal.code} onClick={() => nav(`?view=paldex-detail&pal=${encodeURIComponent(pal.code)}`)}>
          <PalAvatar pal={pal} /><span className="pal-card-main"><strong>{displayName(pal)}</strong><small>{pal.name}</small><span>{pal.types.map((item) => <TypeBadge key={item} type={item} />)}</span></span><em>{palNumber(pal)} · {pal.work.length} 项工作</em>
        </button>)}</div>
      </section>
    </>}
  </>;
}

function PaldexDetailPage({ catalog, error }: { catalog: Catalog | null; error: string }) {
  const code = new URLSearchParams(location.search).get("pal") ?? "";
  const pals = catalog?.pals ?? [];
  const summary = pals.find((pal) => pal.code === code) ?? null;
  const [detail, setDetail] = useState<Pal | null>(null);
  const [detailError, setDetailError] = useState("");
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    setDetail(null);
    setDetailError("");
    fetch(`/data/palworld/details/${encodeURIComponent(code)}.json`)
      .then((response) => response.ok ? response.json() as Promise<Pal> : Promise.reject(new Error(String(response.status))))
      .then((record) => { if (!cancelled) setDetail(record); })
      .catch(() => { if (!cancelled) setDetailError("完整资料暂时无法读取。请确认镜像已更新并重新加载页面。"); });
    return () => { cancelled = true; };
  }, [code]);
  const pal = detail?.code === code ? detail : summary;
  return <><CompanionHeader crumb="帕鲁详情" action={<button className="button-secondary paldex-back" onClick={() => nav("?view=paldex")}>返回图鉴</button>} />
    {error ? <section className="companion-error">{error}</section> : !catalog ? <section className="companion-loading">正在装载图鉴资料…</section> : !code || !summary ? <section className="companion-error">未找到该帕鲁。<button className="button-secondary" onClick={() => nav("?view=paldex")}>返回图鉴</button></section> : <section className="paldex-detail-page"><div className="paldex-detail-nav"><button className="button-secondary" onClick={() => nav("?view=paldex")}>← 返回帕鲁图鉴</button><span className="data-source-mark">资料来源 · 游民星空</span></div><PalDetail pal={pal} pals={pals} loading={!detail && !detailError} error={detailError} /></section>}
  </>;
}

function PalDetail({ pal, pals = [], loading = false, error = "" }: { pal: Pal | null; pals?: Pal[]; loading?: boolean; error?: string }) {
  const [skillDetail, setSkillDetail] = useState(false);
  if (!pal) return <aside className="pal-detail panel"><p className="eyebrow">PAL PROFILE</p><h2>没有匹配的帕鲁</h2><p>换一个关键词或放宽筛选条件。</p></aside>;
  const byCode = new Map(pals.map((item) => [item.code, item]));
  const palName = (code: string) => displayName(byCode.get(code) ?? { name: code, english_name: code, code, paldex: 0, suffix: "", types: [], work: [], stats: null, moves: [], variant: false, boss: false });
  const moves = pal.moves ?? [];
  const breedingAsChild = pal.breeding?.as_child ?? [];
  const breedingAsParent = pal.breeding?.as_parent ?? [];
  const habitatTabs = pal.habitat?.tabs ?? [];
  return <aside className="pal-detail panel"><p className="eyebrow">PAL PROFILE · {palNumber(pal)}</p><div className="pal-detail-title"><PalAvatar pal={pal} large /><div><h2>{displayName(pal)}</h2><small>{pal.name} · {pal.code}</small></div></div><div className="detail-types">{pal.types.map((item) => <TypeBadge key={item} type={item} />)}</div>
    {pal.description && <p className="pal-description">{pal.description}</p>}
    <section><h3>工作适性</h3>{pal.work.length ? <div className="work-chips">{pal.work.map((item) => <span key={item.key}>{item.name}{item.level !== null && <b>Lv.{item.level}</b>}</span>)}</div> : <p className="muted">当前索引未提供工作适性。</p>}</section>
    {loading ? <section className="detail-loading"><h3>完整资料</h3><p className="muted">正在读取这只帕鲁的技能、掉落、出没与配种资料…</p></section> : error ? <section className="detail-loading"><h3>完整资料</h3><p className="muted">{error}</p></section> : <><section><h3>伙伴技能</h3><strong className="partner-skill-name">{pal.partner_skill ?? "当前资料未提供伙伴技能。"}</strong>{pal.partner_skill_description && <p className="muted">{pal.partner_skill_description}</p>}{pal.partner_skill_effects?.length ? <details className="pal-more"><summary>查看升星效果</summary><div className="partner-effects">{pal.partner_skill_effects.map((level) => <div key={level.level}><b>★ {level.level}</b><span>{level.effects.map((effect) => `${effect.effect} ${effect.value}`).join(" · ")}</span></div>)}</div></details> : null}</section>
    <section><h3>基础数值</h3>{pal.stats ? <dl className="stat-list">{Object.entries(pal.stats).filter(([, value]) => Number.isFinite(value)).map(([key, value]) => <div key={key}><dt>{statNames[key] ?? key}</dt><dd>{value}</dd></div>)}</dl> : <p className="muted">当前索引未提供基础数值。</p>}</section>
    <section><h3>移动能力</h3>{pal.movement && Object.keys(pal.movement).length ? <dl className="stat-list">{Object.entries(pal.movement).map(([key, value]) => <div key={key}><dt>{statNames[key] ?? key}</dt><dd>{value}</dd></div>)}</dl> : <p className="muted">当前索引未提供移动参数。</p>}</section>
    <section><div className="detail-section-heading"><h3>主动技能</h3><button type="button" className="skill-detail-toggle" aria-pressed={skillDetail} onClick={() => setSkillDetail((current) => !current)}>{skillDetail ? "简略显示" : "详细参数"}</button></div>{moves.length ? <div className={`move-list ${skillDetail ? "detailed" : "compact"}`}>{moves.map((move, index) => <article key={`${move.id ?? move.skill ?? move.name}-${index}`}><header><b>{move.name ?? move.skill ?? "未知技能"}</b><span>Lv.{move.level}</span></header><div className="move-meta">{move.element && <TypeBadge type={move.element} />}{move.power !== null && move.power !== undefined && <small>威力 {move.power}</small>}{move.cooldown !== null && move.cooldown !== undefined && <small>冷却 {move.cooldown}s</small>}{skillDetail && <>{move.type && <small>{moveTypeNames[move.type] ?? move.type}</small>}{move.range && <small>范围 {move.range.min ?? 0}–{move.range.max ?? "—"}</small>}</>}</div>{skillDetail && move.description && <p>{move.description}</p>}</article>)}</div> : <p className="muted">当前索引未提供主动技能。</p>}</section>
    <section><h3>掉落物</h3>{pal.drops?.length ? <div className="drop-list">{pal.drops.map((drop, index) => <div key={`${drop.item}-${index}`}><b>{drop.item}</b><span>{drop.quantity ?? "—"}</span><small>{drop.probability ?? "—"}</small></div>)}</div> : <p className="muted">当前索引未提供掉落物。</p>}</section>
    <section><h3>出没情况</h3>{habitatTabs.length ? <div className="habitat-list">{habitatTabs.map((tab) => <div key={tab.label}><b>{tab.label}</b><span>{tab.count} 个分布点</span><small>{tab.regions.map((region) => `${region.name} ${region.count}`).join(" · ")}</small></div>)}</div> : <p className="muted">{pal.habitat?.status === "no-wild-distribution-in-table" ? "当前资料未提供野外出没记录。" : "栖息区域仍在整理中。"}</p>}</section>
    <section><h3>配种信息</h3><details className="pal-more"><summary>怎么孵出来（{breedingAsChild.length} 种）</summary>{breedingAsChild.length ? <div className="breeding-list">{breedingAsChild.map(([left, right], index) => <div key={`${left}-${right}-${index}`}><b>{palName(left)}</b><span>＋</span><b>{palName(right)}</b><span>＝</span><strong>{displayName(pal)}</strong></div>)}</div> : <p className="muted">当前索引未提供方案。</p>}</details><details className="pal-more"><summary>能孵出什么（{breedingAsParent.length} 种）</summary>{breedingAsParent.length ? <div className="breeding-list">{breedingAsParent.map((pair, index) => <div key={`${pair.mateId}-${pair.childId}-${index}`}><b>{displayName(pal)}</b><span>＋</span><b>{palName(pair.mateId)}</b><span>＝</span><strong>{palName(pair.childId)}</strong></div>)}</div> : <p className="muted">当前索引未提供方案。</p>}</details></section></>}
    <p className="detail-source">资料来源：游民星空帕鲁图鉴</p>
    <button className="button-secondary companion-link" onClick={() => nav("?view=map")}><PalIcon name="map" />打开互动地图</button>
    <a className="button-primary companion-link source-link" href={pal.source_url ?? "https://app.gamersky.com/tools/palworldwiki/list.html?appNavigationBarStyle=kNoneBar&type=pals"} target="_blank" rel="noreferrer">查看资料源详情</a>
  </aside>;
}

function pointPosition(map: MapCatalog, x: number, y: number) {
  const { west, east, south, north } = map.bounds;
  return {
    left: `${Math.min(100, Math.max(0, ((x - west) / (east - west)) * 100))}%`,
    top: `${Math.min(100, Math.max(0, ((north - y) / (north - south)) * 100))}%`,
  };
}

function WorldMap() {
  const { map, error } = useMapCatalog();
  const viewportRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const wheelRef = useRef<{ factor: number; focalPoint: { x: number; y: number } } | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const zoomCommitRef = useRef<number | null>(null);
  const selectionInitializedRef = useRef(false);
  const mapPositionedRef = useRef(false);
  const zoomRef = useRef(0.5);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mapZoom, setMapZoom] = useState(0.5);
  const categories = map?.categories ?? [];
  const categoryCounts = useMemo(() => new Map((map?.landmarks ?? []).reduce((counts, landmark) => counts.set(landmark.category_id, (counts.get(landmark.category_id) ?? 0) + 1), new Map<number, number>())), [map]);
  const groupedCategories = useMemo(() => {
    const groups = new Map<string, MapCategory[]>();
    categories.forEach((category) => groups.set(category.group, [...(groups.get(category.group) ?? []), category]));
    return [...groups.entries()].map(([name, items]) => ({ name, items }));
  }, [categories]);
  useEffect(() => {
    if (!map || selectionInitializedRef.current) return;
    selectionInitializedRef.current = true;
    setSelectedCategoryIds(categories.filter((category) => category.group === "地点" && (categoryCounts.get(category.id) ?? 0) > 0).map((category) => category.id));
  }, [map, categories, categoryCounts]);
  const selectedCategorySet = useMemo(() => new Set(selectedCategoryIds), [selectedCategoryIds]);
  const markers = useMemo(() => !map ? [] : map.landmarks.filter((landmark) => selectedCategorySet.has(landmark.category_id)), [map, selectedCategorySet]);
  const selected = markers.find((marker) => marker.id === selectedId) ?? markers[0] ?? null;
  const tiles = useMemo(() => {
    if (!map) return [];
    const result: Array<{ key: string; src: string }> = [];
    for (let y = map.tile.yStart; y <= map.tile.yEnd; y += 1) for (let x = map.tile.xStart; x <= map.tile.xEnd; x += 1) result.push({ key: `${x}-${y}`, src: `${map.tile.path}/${x}_${y}.jpg` });
    return result;
  }, [map]);
  const mapWidth = map ? (map.tile.xEnd - map.tile.xStart + 1) * map.tile.size : 0;
  const mapHeight = map ? (map.tile.yEnd - map.tile.yStart + 1) * map.tile.size : 0;
  useEffect(() => {
    if (!map || !viewportRef.current || mapPositionedRef.current) return;
    mapPositionedRef.current = true;
    const viewport = viewportRef.current;
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, (mapWidth * zoomRef.current - viewport.clientWidth) / 2);
      viewport.scrollTop = Math.max(0, (mapHeight * zoomRef.current - viewport.clientHeight) / 2);
    });
  }, [map, mapHeight, mapWidth]);
  useEffect(() => () => {
    if (wheelFrameRef.current !== null) cancelAnimationFrame(wheelFrameRef.current);
    if (zoomCommitRef.current !== null) window.clearTimeout(zoomCommitRef.current);
  }, []);
  const commitZoomLabel = (zoom: number) => {
    if (zoomCommitRef.current !== null) window.clearTimeout(zoomCommitRef.current);
    zoomCommitRef.current = window.setTimeout(() => {
      setMapZoom(zoomRef.current);
      zoomCommitRef.current = null;
    }, 120);
  };
  const applyMapZoom = (nextZoom: number, focalPoint?: { x: number; y: number }) => {
    const viewport = viewportRef.current;
    const scaler = scalerRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !scaler || !canvas) return;
    const previousZoom = zoomRef.current;
    const zoom = Math.min(2.5, Math.max(0.12, nextZoom));
    if (Math.abs(zoom - previousZoom) < 0.001) return;
    const focalX = focalPoint?.x ?? viewport.clientWidth / 2;
    const focalY = focalPoint?.y ?? viewport.clientHeight / 2;
    const mapX = (viewport.scrollLeft + focalX) / previousZoom;
    const mapY = (viewport.scrollTop + focalY) / previousZoom;
    zoomRef.current = zoom;
    // Keep the heavy tile and marker tree out of React's high-frequency render path.
    // The map is one composited layer; only the small zoom label is committed after input pauses.
    scaler.style.width = `${mapWidth * zoom}px`;
    scaler.style.height = `${mapHeight * zoom}px`;
    canvas.style.transform = `translate3d(0, 0, 0) scale(${zoom})`;
    viewport.scrollLeft = Math.max(0, mapX * zoom - focalX);
    viewport.scrollTop = Math.max(0, mapY * zoom - focalY);
    commitZoomLabel(zoom);
  };
  const zoomWithWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
    const pending = wheelRef.current ?? { factor: 1, focalPoint: { x: 0, y: 0 } };
    pending.factor *= Math.exp(-delta * 0.0015);
    pending.focalPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    wheelRef.current = pending;
    if (wheelFrameRef.current !== null) return;
    wheelFrameRef.current = requestAnimationFrame(() => {
      const current = wheelRef.current;
      wheelRef.current = null;
      wheelFrameRef.current = null;
      if (current) applyMapZoom(zoomRef.current * current.factor, current.focalPoint);
    });
  };
  const startMapDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false };
  };
  const moveMapDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || !viewport || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 3) return;
    drag.moved = true;
    setDragging(true);
    viewport.scrollLeft = drag.left - deltaX;
    viewport.scrollTop = drag.top - deltaY;
    event.preventDefault();
  };
  const endMapDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  };
  const toggleCategory = (categoryId: number) => {
    setSelectedCategoryIds((current) => current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId]);
    setSelectedId(null);
  };
  const toggleGroup = (items: MapCategory[]) => {
    const populated = items.filter((category) => (categoryCounts.get(category.id) ?? 0) > 0).map((category) => category.id);
    const isFullySelected = populated.length > 0 && populated.every((id) => selectedCategorySet.has(id));
    setSelectedCategoryIds((current) => isFullySelected ? current.filter((id) => !populated.includes(id)) : [...new Set([...current, ...populated])]);
    setSelectedId(null);
  };
  const selectAllCategories = () => {
    setSelectedCategoryIds(categories.filter((category) => (categoryCounts.get(category.id) ?? 0) > 0).map((category) => category.id));
    setSelectedId(null);
  };

  return <><CompanionHeader crumb="世界地图" action={<><span className="companion-count"><PalIcon name="map" />离线地图 · {map?.landmarks.length ?? "—"} 个点位</span><span className="data-source-mark">点位来源 · {map?.source.provider ?? "游民星空"}</span></>} />
    <section className="companion-hero panel map-hero"><div><p className="eyebrow">WORLD MAP · LOCAL DATA SNAPSHOT</p><h1>世界地图</h1><p>本地保存底图、区域、分类图标和全部点位。加载、筛选与查看标记均不依赖外部 iframe 或第三方 Cookie。</p><p className="source-caption">底图与地图点位来源：{map?.source.provider ?? "游民星空"}</p></div><div className="companion-hero-mark"><PalIcon name="map" /><small>{map?.source.updated_at ? `地图更新 · ${map.source.updated_at}` : "本地地图快照"}</small></div></section>
    {error ? <section className="companion-error">{error}</section> : !map ? <section className="companion-loading">正在装载离线世界地图…</section> : <section className="map-layout">
      <aside className="map-filter panel"><p className="eyebrow">MAP MARKERS</p><h2>地图标点</h2><p className="map-filter-help">选择要在地图上显示的类型；默认开启地点标记。</p><div className="map-filter-actions"><button type="button" onClick={selectAllCategories}>全选标点</button><button type="button" onClick={() => { setSelectedCategoryIds([]); setSelectedId(null); }}>清空标点</button></div>{groupedCategories.map((group) => { const populated = group.items.filter((category) => (categoryCounts.get(category.id) ?? 0) > 0); const allSelected = populated.length > 0 && populated.every((category) => selectedCategorySet.has(category.id)); return <section className="marker-group" key={group.name}><header><h3>{group.name}</h3><button type="button" disabled={!populated.length} onClick={() => toggleGroup(group.items)}>{allSelected ? "取消全选" : "全选"}</button></header><div>{group.items.map((category) => { const count = categoryCounts.get(category.id) ?? 0; const checked = selectedCategorySet.has(category.id); return <label className={`map-category ${checked ? "selected" : ""} ${!count ? "empty" : ""}`} key={category.id}><input type="checkbox" checked={checked} disabled={!count} onChange={() => toggleCategory(category.id)} /><span className="map-category-icon">{category.icon ? <img src={category.icon} alt="" /> : <PalIcon name="map" />}</span><span>{category.name}</span><b>{count || "—"}</b></label>; })}</div></section>; })}<footer>点位来源：{map.source.provider ?? "游民星空"}</footer>{selected && <section className="map-selected map-filter-selected"><p className="eyebrow">SELECTED MARKER · 游民星空</p><h3>{selected.name}</h3><small>{selected.group} · {selected.category}</small>{selected.description && <p>{selected.description.replace(/<[^>]*>/g, " ")}</p>}</section>}</aside>
      <section className="world-map panel">
        <div className="map-toolbar"><div><small>当前显示</small><strong>{markers.length} 个标记</strong></div><div className="map-toolbar-actions"><span className="map-drag-hint">滚轮缩放 · 左键拖动</span><div className="map-zoom-controls" role="group" aria-label="地图缩放"><button type="button" onClick={() => applyMapZoom(zoomRef.current / 1.3)} aria-label="缩小地图">缩小</button><output aria-live="polite">{Math.round(mapZoom * 100)}%</output><button type="button" onClick={() => applyMapZoom(zoomRef.current * 1.3)} aria-label="放大地图">放大</button><button type="button" onClick={() => applyMapZoom(0.5)} aria-label="复位地图缩放">复位</button></div></div></div>
        <div className="offline-map-shell">
          <div ref={viewportRef} className={`offline-map-viewport ${dragging ? "dragging" : ""}`} tabIndex={0} aria-label="可用滚轮缩放和鼠标拖动的离线世界地图" onWheel={zoomWithWheel} onPointerDown={startMapDrag} onPointerMove={moveMapDrag} onPointerUp={endMapDrag} onPointerCancel={endMapDrag}>
            <div ref={scalerRef} className="offline-map-scaler" style={{ width: mapWidth * 0.5, height: mapHeight * 0.5 }}>
            <div ref={canvasRef} className="offline-map-canvas" style={{ width: mapWidth, height: mapHeight, transform: "translate3d(0, 0, 0) scale(0.5)" }}>
              <div className="offline-map-tiles" style={{ gridTemplateColumns: `repeat(${map.tile.xEnd - map.tile.xStart + 1}, ${map.tile.size}px)` }}>{tiles.map((tile) => <img key={tile.key} src={tile.src} alt="" draggable={false} loading="lazy" />)}</div>
              {map.areas.map((area) => <span className="map-area-label" key={area.name} style={pointPosition(map, area.x, area.y)}>{area.name}</span>)}
              {markers.map((marker) => { const category = categories.find((item) => item.id === marker.category_id); return <button className={`map-marker ${selected?.id === marker.id ? "selected" : ""}`} key={marker.id} style={pointPosition(map, marker.x, marker.y)} onPointerDown={(event) => event.stopPropagation()} onClick={() => setSelectedId(marker.id)} aria-label={`${marker.category}：${marker.name}，点位来源游民星空`} title={marker.name}>{category?.icon ? <img src={category.icon} alt="" /> : <i />}</button>; })}
            </div>
            </div>
          </div>
        </div>
        <footer className="map-foot"><span><i />底图、图标与点位来源：游民星空（已保存至本地 `/data/palworld/`）</span><small>滚轮缩放、左键拖动；选择分类可减少标记遮挡。</small></footer>
      </section>
    </section>}
  </>;
}

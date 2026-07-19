import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { PalIcon } from "./PalIcons";
import ThemeToggle from "./ThemeToggle";
import "./companion.css";

type Work = { key: string; name: string; level: number | null };
type Pal = {
  code: string; paldex: number; suffix: string; name: string; name_zh?: string | null; english_name: string;
  types: string[]; work: Work[]; stats: Record<string, number> | null; moves: Array<{ skill: string; level: number }>;
  variant: boolean; boss: boolean; icon?: string; partner_skill?: string | null; description?: string | null; source_url?: string;
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
const statNames: Record<string, string> = { HP: "生命", ATK: "攻击", DEF: "防御", RUN: "跑速", SPRINT: "冲刺", PRICE: "价格" };
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

  return <><CompanionHeader crumb="帕鲁图鉴" action={<><span className="companion-count"><PalIcon name="paldex" />{pals.length || "—"} 条 · {catalog?.game_version ?? "最新"}</span><span className="data-source-mark">资料来源 · {catalog?.source.provider ?? "游民星空"}</span></>} />
    <section className="companion-hero panel"><div><p className="eyebrow">PALDECK · OFFLINE DATA SNAPSHOT</p><h1>帕鲁图鉴</h1><p>内置最新中文图鉴、头像、工作适性、伙伴技能与招式快照；可按元素、工作适性及名称筛选，运行时无需访问第三方站点。</p><p className="source-caption">图鉴资料来源：{catalog?.source.provider ?? "游民星空"}</p></div><div className="companion-hero-mark"><PalIcon name="paldex" /><small>{catalog?.source.dataset_updated ? `INDEX · ${catalog.source.dataset_updated}` : "本地图鉴快照"}</small></div></section>
    {error ? <section className="companion-error">{error}</section> : !catalog ? <section className="companion-loading">正在装载图鉴资料…</section> : <>
      <section className="paldex-tools panel" aria-label="图鉴筛选">
        <label className="companion-search"><PalIcon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索中文名、英文名、图鉴编号或内部编号" /></label>
        <label>元素<select value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部元素</option>{types.map((item) => <option key={item} value={item}>{typeNames[item] ?? item}</option>)}</select></label>
        <label>工作<select value={work} onChange={(event) => setWork(event.target.value)}><option value="all">全部工作</option>{works.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
        <strong>{filtered.length} <small>/ {pals.length}</small></strong>
      </section>
      <section className="paldex-layout">
        <div className="paldex-grid" aria-live="polite">{filtered.map((pal) => <button className={`pal-card ${selected?.code === pal.code ? "selected" : ""}`} key={pal.code} onClick={() => setSelectedCode(pal.code)}>
          <PalAvatar pal={pal} /><span className="pal-card-main"><strong>{displayName(pal)}</strong><small>{pal.name}</small><span>{pal.types.map((item) => <TypeBadge key={item} type={item} />)}</span></span><em>{palNumber(pal)} · {pal.work.length} 项工作</em>
        </button>)}</div>
        <PalDetail pal={selected} />
      </section>
    </>}
  </>;
}

function PalDetail({ pal }: { pal: Pal | null }) {
  if (!pal) return <aside className="pal-detail panel"><p className="eyebrow">PAL PROFILE</p><h2>没有匹配的帕鲁</h2><p>换一个关键词或放宽筛选条件。</p></aside>;
  return <aside className="pal-detail panel"><p className="eyebrow">PAL PROFILE · {palNumber(pal)}</p><div className="pal-detail-title"><PalAvatar pal={pal} large /><div><h2>{displayName(pal)}</h2><small>{pal.name} · {pal.code}</small></div></div><div className="detail-types">{pal.types.map((item) => <TypeBadge key={item} type={item} />)}</div>
    <section><h3>工作适性</h3>{pal.work.length ? <div className="work-chips">{pal.work.map((item) => <span key={item.key}>{item.name}{item.level !== null && <b>Lv.{item.level}</b>}</span>)}</div> : <p className="muted">当前索引未提供工作适性。</p>}</section>
    <section><h3>基础数值</h3>{pal.stats ? <dl className="stat-list">{Object.entries(pal.stats).filter(([, value]) => Number.isFinite(value)).map(([key, value]) => <div key={key}><dt>{statNames[key] ?? key}</dt><dd>{value}</dd></div>)}</dl> : <p className="muted">当前索引未提供基础数值。</p>}</section>
    <section><h3>伙伴技能</h3><p className="muted">{pal.partner_skill ?? "当前资料未提供伙伴技能。"}</p></section>
    <section><h3>招式</h3>{pal.moves.length ? <div className="work-chips">{pal.moves.slice(0, 9).map((move, index) => <span key={`${move.skill}-${index}`}>{move.skill}{move.level > 0 && <b>Lv.{move.level}</b>}</span>)}</div> : <p className="muted">当前资料未提供招式。</p>}</section>
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
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const categories = map?.categories ?? [];
  const activeCategory = categories.find((category) => String(category.id) === categoryId) ?? categories.find((category) => category.name === "巨鹫之像") ?? categories[0];
  const markers = useMemo(() => !map || !activeCategory ? [] : map.landmarks.filter((landmark) => landmark.category_id === activeCategory.id), [map, activeCategory]);
  const selected = markers.find((marker) => marker.id === selectedId) ?? markers[0] ?? null;
  const tiles = useMemo(() => {
    if (!map) return [];
    const result: Array<{ key: string; src: string }> = [];
    for (let y = map.tile.yStart; y <= map.tile.yEnd; y += 1) for (let x = map.tile.xStart; x <= map.tile.xEnd; x += 1) result.push({ key: `${x}-${y}`, src: `${map.tile.path}/${x}_${y}.jpg` });
    return result;
  }, [map]);
  useEffect(() => {
    if (!map || !viewportRef.current) return;
    const viewport = viewportRef.current;
    const width = (map.tile.xEnd - map.tile.xStart + 1) * map.tile.size;
    const height = (map.tile.yEnd - map.tile.yStart + 1) * map.tile.size;
    viewport.scrollLeft = Math.max(0, (width - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (height - viewport.clientHeight) / 2);
  }, [map]);
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

  return <><CompanionHeader crumb="世界地图" action={<><span className="companion-count"><PalIcon name="map" />离线地图 · {map?.landmarks.length ?? "—"} 个点位</span><span className="data-source-mark">点位来源 · {map?.source.provider ?? "游民星空"}</span></>} />
    <section className="companion-hero panel map-hero"><div><p className="eyebrow">WORLD MAP · LOCAL DATA SNAPSHOT</p><h1>世界地图</h1><p>本地保存底图、区域、分类图标和全部点位。加载、筛选与查看标记均不依赖外部 iframe 或第三方 Cookie。</p><p className="source-caption">底图与地图点位来源：{map?.source.provider ?? "游民星空"}</p></div><div className="companion-hero-mark"><PalIcon name="map" /><small>{map?.source.updated_at ? `地图更新 · ${map.source.updated_at}` : "本地地图快照"}</small></div></section>
    {error ? <section className="companion-error">{error}</section> : !map ? <section className="companion-loading">正在装载离线世界地图…</section> : <section className="map-layout">
      <section className="world-map panel">
        <div className="map-toolbar"><label>点位分类<select value={activeCategory ? String(activeCategory.id) : ""} onChange={(event) => { setCategoryId(event.target.value); setSelectedId(null); }}><option value="">选择点位类型</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.group} · {category.name}</option>)}</select></label><strong className="map-marker-count">{markers.length} 个标记</strong></div>
        <div className="offline-map-shell">
          <div ref={viewportRef} className={`offline-map-viewport ${dragging ? "dragging" : ""}`} tabIndex={0} aria-label="可用鼠标拖动的离线世界地图" onPointerDown={startMapDrag} onPointerMove={moveMapDrag} onPointerUp={endMapDrag} onPointerCancel={endMapDrag}>
            <div className="offline-map-canvas" style={{ width: (map.tile.xEnd - map.tile.xStart + 1) * map.tile.size, height: (map.tile.yEnd - map.tile.yStart + 1) * map.tile.size }}>
              <div className="offline-map-tiles" style={{ gridTemplateColumns: `repeat(${map.tile.xEnd - map.tile.xStart + 1}, ${map.tile.size}px)` }}>{tiles.map((tile) => <img key={tile.key} src={tile.src} alt="" draggable={false} loading="lazy" />)}</div>
              {map.areas.map((area) => <span className="map-area-label" key={area.name} style={pointPosition(map, area.x, area.y)}>{area.name}</span>)}
              {markers.map((marker) => <button className={`map-marker ${selected?.id === marker.id ? "selected" : ""}`} key={marker.id} style={pointPosition(map, marker.x, marker.y)} onPointerDown={(event) => event.stopPropagation()} onClick={() => setSelectedId(marker.id)} aria-label={`${marker.category}：${marker.name}，点位来源游民星空`} title={marker.name}>{activeCategory?.icon ? <img src={activeCategory.icon} alt="" /> : <i />}</button>)}
            </div>
          </div>
        </div>
        <footer className="map-foot"><span><i />底图、图标与点位来源：游民星空（已保存至本地 `/data/palworld/`）</span><small>按住鼠标左键拖动查看全图；选择分类可减少标记遮挡。</small></footer>
      </section>
      <aside className="map-info panel"><p className="eyebrow">OFFLINE MAP DATA</p><div className="pal-detail-title"><span className="pal-monogram large"><PalIcon name="map" /></span><div><h2>{map.name}</h2><small>{map.source.provider ?? "游民星空"} 数据快照</small></div></div><dl><div><dt>底图模式</dt><dd>本地高分辨率瓦片</dd></div><div><dt>点位来源</dt><dd>{map.source.provider ?? "游民星空"}</dd></div><div><dt>点位总数</dt><dd>{map.landmarks.length}</dd></div><div><dt>分类数量</dt><dd>{categories.length}</dd></div><div><dt>当前分类</dt><dd>{activeCategory?.name ?? "—"}</dd></div></dl>{selected ? <section className="map-selected"><p className="eyebrow">SELECTED MARKER · 游民星空</p><h3>{selected.name}</h3><small>{selected.group} · {selected.category}</small>{selected.description && <p>{selected.description.replace(/<[^>]*>/g, " ")}</p>}</section> : <p className="map-source">选择地图上的图标可查看名称、分类和备注。</p>}<a className="button-secondary companion-link source-link" href={map.source.website} target="_blank" rel="noreferrer">查看游民星空公开资料</a></aside>
    </section>}
  </>;
}

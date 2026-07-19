import { useEffect, useMemo, useRef, useState } from "react";
import { PalIcon } from "./PalIcons";
import ThemeToggle from "./ThemeToggle";
import "./companion.css";

type Work = { key: string; name: string; level: number };
type Pal = { code: string; name: string; english_name: string; types: string[]; work: Work[]; stats: Record<string, number> | null; moves: Array<{ skill: string; level: number }>; variant: boolean; boss: boolean };
type Catalog = { pals: Pal[]; source: { repository: string; license: string } };
type Distribution = { code: string; phase: "day" | "night"; x: number; y: number; radius: number };
type DistributionCatalog = { points: Distribution[]; source: { repository: string; license: string } };

const typeNames: Record<string, string> = { normal: "无", fire: "火", water: "水", electricity: "雷", leaf: "草", ice: "冰", earth: "地", dark: "暗", dragon: "龙" };

function nav(to: string) { location.href = to; }

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
    <footer>资料库 · 本地静态数据</footer>
  </aside>;
}

function CompanionHeader({ crumb, action }: { crumb: string; action?: React.ReactNode }) {
  return <header className="companion-header"><div className="crumb">世界资料　/　<strong>{crumb}</strong></div><div className="pal-header-actions">{action}<ThemeToggle /></div></header>;
}

function TypeBadge({ type }: { type: string }) { return <span className={`type-badge ${type}`}>{typeNames[type] ?? type}</span>; }

export default function CompanionPanel({ view }: { view: "paldex" | "map" }) {
  const { catalog, error } = useCatalog();
  return <div className="shell"><CompanionSidebar active={view} /><main className="companion-main" id="main">
    {view === "paldex" ? <Paldex catalog={catalog} error={error} /> : <WorldMap catalog={catalog} error={error} />}
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
    return (!needle || `${pal.name} ${pal.english_name} ${pal.code}`.toLocaleLowerCase().includes(needle))
      && (type === "all" || pal.types.includes(type))
      && (work === "all" || pal.work.some((item) => item.key === work));
  }), [pals, query, type, work]);
  const selected = pals.find((pal) => pal.code === selectedCode) ?? filtered[0] ?? null;

  return <><CompanionHeader crumb="帕鲁图鉴" action={<span className="companion-count"><PalIcon name="paldex" />{pals.length || "—"} 条资料</span>} />
    <section className="companion-hero panel"><div><p className="eyebrow">PALDECK · LOCAL REFERENCE</p><h1>帕鲁图鉴</h1><p>按属性、工作适性和名称筛选。点击条目可查看基础资料，并将其分布直接带到坐标地图。</p></div><div className="companion-hero-mark"><PalIcon name="paldex" /><small>资料数据可追溯</small></div></section>
    {error ? <section className="companion-error">{error}</section> : !catalog ? <section className="companion-loading">正在装载图鉴资料…</section> : <>
      <section className="paldex-tools panel" aria-label="图鉴筛选">
        <label className="companion-search"><PalIcon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索中文名、英文名或内部编号" /></label>
        <label>元素<select value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部元素</option>{types.map((item) => <option key={item} value={item}>{typeNames[item] ?? item}</option>)}</select></label>
        <label>工作<select value={work} onChange={(event) => setWork(event.target.value)}><option value="all">全部工作</option>{works.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
        <strong>{filtered.length} <small>/ {pals.length}</small></strong>
      </section>
      <section className="paldex-layout">
        <div className="paldex-grid" aria-live="polite">{filtered.map((pal) => <button className={`pal-card ${selected?.code === pal.code ? "selected" : ""}`} key={pal.code} onClick={() => setSelectedCode(pal.code)}>
          <span className="pal-monogram">{pal.name.slice(0, 1)}</span><span className="pal-card-main"><strong>{pal.name}</strong><small>{pal.english_name}</small><span>{pal.types.map((item) => <TypeBadge key={item} type={item} />)}</span></span><em>{pal.work.length} 项工作</em>
        </button>)}</div>
        <PalDetail pal={selected} />
      </section>
    </>}
  </>;
}

function PalDetail({ pal }: { pal: Pal | null }) {
  if (!pal) return <aside className="pal-detail panel"><p className="eyebrow">PAL PROFILE</p><h2>没有匹配的帕鲁</h2><p>换一个关键词或放宽筛选条件。</p></aside>;
  return <aside className="pal-detail panel"><p className="eyebrow">PAL PROFILE</p><div className="pal-detail-title"><span className="pal-monogram large">{pal.name.slice(0, 1)}</span><div><h2>{pal.name}</h2><small>{pal.english_name} · {pal.code}</small></div></div><div className="detail-types">{pal.types.map((item) => <TypeBadge key={item} type={item} />)}</div>
    <section><h3>工作适性</h3>{pal.work.length ? <div className="work-chips">{pal.work.map((item) => <span key={item.key}>{item.name}<b>Lv.{item.level}</b></span>)}</div> : <p className="muted">没有可用工作适性。</p>}</section>
    <section><h3>基础成长</h3>{pal.stats ? <dl className="stat-list">{Object.entries(pal.stats).map(([key, value]) => <div key={key}><dt>{({ HP: "生命", PHY: "近战", MAG: "攻击", DEF: "防御" } as Record<string, string>)[key] ?? key}</dt><dd>{value}</dd></div>)}</dl> : <p className="muted">资料暂未提供基础成长。</p>}</section>
    <section><h3>招式等级</h3><p className="moves">{pal.moves.slice(0, 8).map((move) => <span key={move.skill}>Lv.{move.level}</span>)}</p></section>
    <button className="button-primary companion-link" onClick={() => nav(`?view=map&pal=${encodeURIComponent(pal.code)}`)}><PalIcon name="map" />在地图查看分布</button>
  </aside>;
}

function WorldMap({ catalog, error }: { catalog: Catalog | null; error: string }) {
  const [distribution, setDistribution] = useState<DistributionCatalog | null>(null);
  const [distributionError, setDistributionError] = useState("");
  const initial = new URLSearchParams(location.search).get("pal") ?? "";
  const [selectedCode, setSelectedCode] = useState(initial);
  const [phase, setPhase] = useState<"day" | "night">("day");
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  useEffect(() => { fetch("/companion/distributions.json").then((response) => response.ok ? response.json() as Promise<DistributionCatalog> : Promise.reject(new Error(String(response.status)))).then(setDistribution).catch(() => setDistributionError("地图坐标资料暂时无法读取。")); }, []);
  const pals = catalog?.pals ?? [];
  const selected = pals.find((pal) => pal.code === selectedCode) ?? pals[0] ?? null;
  useEffect(() => { if (!selectedCode && selected) setSelectedCode(selected.code); }, [selected, selectedCode]);
  const points = useMemo(() => (distribution?.points ?? []).filter((point) => point.code === selected?.code && point.phase === phase).slice(0, 700), [distribution, selected?.code, phase]);
  const detail = selected ? `${selected.name} · ${phase === "day" ? "白天" : "夜晚"}分布` : "等待图鉴资料";
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => { dragging.current = { x: event.clientX, y: event.clientY, originX: offset.x, originY: offset.y }; event.currentTarget.setPointerCapture(event.pointerId); };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => { if (!dragging.current) return; setOffset({ x: dragging.current.originX + event.clientX - dragging.current.x, y: dragging.current.originY + event.clientY - dragging.current.y }); };
  const endDrag = () => { dragging.current = null; };
  const zoom = (amount: number) => setScale((current) => Math.min(2.3, Math.max(0.85, Number((current + amount).toFixed(2)))));

  return <><CompanionHeader crumb="世界地图" action={<button className="refresh" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}><PalIcon name="refresh" /><span>重置视图</span></button>} />
    <section className="companion-hero panel map-hero"><div><p className="eyebrow">WORLD DISTRIBUTION · COORDINATE LAYER</p><h1>世界地图</h1><p>显示帕鲁在世界坐标中的昼夜分布。地图资料与底图视觉分离，后续可无损替换为授权底图。</p></div><div className="companion-hero-mark"><PalIcon name="map" /><small>可缩放 · 可拖动</small></div></section>
    {error || distributionError ? <section className="companion-error">{error || distributionError}</section> : !catalog || !distribution || !selected ? <section className="companion-loading">正在装载世界坐标资料…</section> : <section className="map-layout">
      <section className="world-map panel">
        <div className="map-toolbar"><label>查看帕鲁<select value={selected.code} onChange={(event) => setSelectedCode(event.target.value)}>{pals.map((pal) => <option key={pal.code} value={pal.code}>{pal.name} · {pal.english_name}</option>)}</select></label><div className="phase-toggle"><button className={phase === "day" ? "active" : ""} onClick={() => setPhase("day")}>白天</button><button className={phase === "night" ? "active" : ""} onClick={() => setPhase("night")}>夜晚</button></div></div>
        <div className="map-stage" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onWheel={(event) => { event.preventDefault(); zoom(event.deltaY < 0 ? .12 : -.12); }}>
          <div className="map-world" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
            <div className="map-grid" /><div className="map-land land-one" /><div className="map-land land-two" /><div className="map-land land-three" />
            {points.map((point, index) => <i className="habitat-point" key={`${point.code}-${point.phase}-${index}`} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} title={detail} />)}
          </div>
          <div className="map-label north">N</div><div className="map-label southwest">WORLD COORDINATE LAYER</div><div className="map-controls"><button aria-label="放大地图" onClick={() => zoom(.15)}>+</button><button aria-label="缩小地图" onClick={() => zoom(-.15)}>−</button></div>
        </div>
        <footer className="map-foot"><span><i />{detail}</span><small>{points.length} 个已降采样分布点 · 滚轮缩放，拖动查看</small></footer>
      </section>
      <aside className="map-info panel"><p className="eyebrow">DISTRIBUTION RECORD</p><div className="pal-detail-title"><span className="pal-monogram large">{selected.name.slice(0, 1)}</span><div><h2>{selected.name}</h2><small>{selected.english_name}</small></div></div><div className="detail-types">{selected.types.map((item) => <TypeBadge key={item} type={item} />)}</div><dl><div><dt>当前时段</dt><dd>{phase === "day" ? "白天" : "夜晚"}</dd></div><div><dt>图层点位</dt><dd>{points.length}</dd></div><div><dt>坐标来源</dt><dd>MIT 数据集</dd></div></dl><button className="button-secondary companion-link" onClick={() => nav(`?view=paldex&pal=${encodeURIComponent(selected.code)}`)}><PalIcon name="paldex" />查看图鉴资料</button><p className="map-source">地图仅展示位置分布，不代表精确刷新点或实时服务器状态。</p></aside>
    </section>}
  </>;
}

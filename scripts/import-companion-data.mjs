import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

const PAL_BASE_URL = "https://app.gamersky.com/tools/palworldwiki/data/palworld/palworld-base.js";
const PALS_URL = "https://app.gamersky.com/tools/palworldwiki/data/palworld/pals.js";
const MAP_API_URL = "https://wkmap1.gamersky.com/map/getMap";
const LANDMARK_API_URL = "https://wkmap1.gamersky.com/landmark/getLandmarkList";
const MAP_WEBSITE = "https://app.gamersky.com/map/?gsAppChannel=diTu&gsGameId=1395719&mapId=26";
const MAP_ID = 26;
const OUTPUT = resolve(process.argv[2] ?? "frontend/public/data/palworld");
const TILE_ZOOM = Number(process.env.PALWORLD_MAP_ZOOM ?? 12);
if (!Number.isInteger(TILE_ZOOM) || TILE_ZOOM < 8 || TILE_ZOOM > 16) throw new Error("PALWORLD_MAP_ZOOM must be an integer between 8 and 16");
const mapTileX = (longitude, zoom) => Math.floor(((longitude + 180) / 360) * 2 ** zoom);
const mapTileY = (latitude, zoom) => Math.floor(((1 - Math.log(Math.tan(latitude * Math.PI / 180) + 1 / Math.cos(latitude * Math.PI / 180)) / Math.PI) / 2) * 2 ** zoom);
const TILE_RANGE = {
  xStart: mapTileX(-1.40625, TILE_ZOOM), xEnd: mapTileX(0, TILE_ZOOM) - 1,
  yStart: mapTileY(1.4061088354351595, TILE_ZOOM), yEnd: mapTileY(0, TILE_ZOOM) - 1,
};

const elementKeys = {
  "无属性": "neutral", "普通": "neutral", "火": "fire", "火属性": "fire", "水": "water", "水属性": "water",
  "雷": "electricity", "雷属性": "electricity", "草": "leaf", "草属性": "leaf", "冰": "ice", "冰属性": "ice",
  "地": "earth", "地属性": "earth", "暗": "dark", "暗属性": "dark", "龙": "dragon", "龙属性": "dragon",
};

function safeName(value) {
  return String(value ?? "").replace(/[^A-Za-z0-9_-]/g, "_");
}

function sourceUrl(value) {
  const url = new URL(String(value).startsWith("//") ? `https:${value}` : value);
  if (!url.hostname.endsWith("gamersky.com")) throw new Error(`Refusing untrusted asset host: ${url.hostname}`);
  url.protocol = "https:";
  return url.toString();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "PalworldServerManager data import" } });
  if (!response.ok) throw new Error(`Unable to download ${url}: HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", "user-agent": "PalworldServerManager data import", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Unable to download ${url}: HTTP ${response.status}`);
  return response.json();
}

function extractAssignedJson(source, key) {
  const match = source.match(new RegExp(`var data\\s*=\\s*([\\s\\S]*?)\\s*;\\s*chunks\\["${key}"\\]`));
  if (!match) throw new Error(`Unable to find ${key} data in public data file`);
  return JSON.parse(match[1]);
}

async function downloadAsset(url, target) {
  const response = await fetch(sourceUrl(url), { headers: { "user-agent": "PalworldServerManager data import" } });
  if (!response.ok) throw new Error(`Unable to download asset ${url}: HTTP ${response.status}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function mapConcurrent(items, limit, task) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await task(item);
    }
  }));
}

function numberAndSuffix(number) {
  const value = String(number ?? "");
  const match = value.match(/^(\d+)(.*)$/);
  return { paldex: Number(match?.[1] ?? 0), suffix: match?.[2] ?? "" };
}

function palRecord(raw) {
  const { paldex, suffix } = numberAndSuffix(raw.number);
  const iconExtension = extname(new URL(sourceUrl(raw.icon.src)).pathname) || ".png";
  const iconFile = `${safeName(raw.id)}${iconExtension}`;
  const stats = raw.stats ?? {};
  const movement = raw.movement ?? {};
  return {
    code: raw.id,
    paldex,
    suffix,
    name: raw.nameEn ?? raw.id,
    name_zh: raw.nameZh ?? null,
    english_name: raw.nameEn ?? raw.id,
    icon: `/data/palworld/icons/${iconFile}`,
    types: (raw.elements ?? []).map((element) => elementKeys[element] ?? element),
    work: Object.entries(raw.workSuitability ?? {}).map(([name, level]) => ({ key: name, name, level: Number(level) || null })),
    stats: { HP: stats.hp, ATK: stats.shotAttack ?? stats.attack, DEF: stats.defense, RUN: movement.run, SPRINT: raw.game?.rideSprintSpeed ?? movement.run, PRICE: raw.game?.price }
      && Object.fromEntries(Object.entries({ HP: stats.hp, ATK: stats.shotAttack ?? stats.attack, DEF: stats.defense, RUN: movement.run, SPRINT: raw.game?.rideSprintSpeed ?? movement.run, PRICE: raw.game?.price }).filter(([, value]) => Number.isFinite(value))),
    moves: (raw.activeSkills ?? []).map((skill) => ({ skill: skill.nameZh ?? skill.nameEn ?? skill.id, level: Number(skill.level) || 0 })),
    variant: Boolean(suffix),
    boss: Boolean(raw.isBossForm),
    rarity: raw.rarity ?? null,
    partner_skill: raw.partnerSkill?.name ?? null,
    description: raw.description ?? null,
    source_url: "https://app.gamersky.com/tools/palworldwiki/list.html?appNavigationBarStyle=kNoneBar&type=pals",
    _icon_source: raw.icon?.src,
  };
}

function flattenCategories(groups) {
  return (groups ?? []).flatMap((group) => (group.landmarkCatalogs ?? []).map((catalog) => ({
    id: catalog.id,
    group: group.groupName,
    name: catalog.name,
    iconUrl: catalog.iconUrl ?? catalog.iconSelectedUrl,
  })));
}

const [baseScript, palsScript, mapResponse] = await Promise.all([
  fetchText(PAL_BASE_URL),
  fetchText(PALS_URL),
  fetchJson(MAP_API_URL, { method: "POST", body: JSON.stringify({ gameMapId: MAP_ID, mapId: MAP_ID, userId: 0 }) }),
]);

const base = extractAssignedJson(baseScript, "base");
const rawPals = extractAssignedJson(palsScript, "pals");
if (!Array.isArray(rawPals)) throw new Error("Unexpected Pals data format");
const palsWithAssets = rawPals.map(palRecord).filter((pal) => pal.paldex > 0).sort((a, b) => a.paldex - b.paldex || a.suffix.localeCompare(b.suffix));
if (palsWithAssets.length < 280) throw new Error(`Only ${palsWithAssets.length} Pals found; refusing to write a partial catalog`);

const map = mapResponse.map;
if (!map?.mapTileUrlsRoot) throw new Error("Public map response is incomplete; refusing to write a partial offline map");
const categories = flattenCategories(map.landmarkCatalogGroups);
const categoryLandmarks = [];
console.log(`Downloading public markers from ${categories.length} map categories…`);
await mapConcurrent(categories, 4, async (category) => {
  const response = await fetchJson(LANDMARK_API_URL, { method: "POST", body: JSON.stringify({ gameMapId: MAP_ID, catalogIdsSelected: [category.id], userId: 0, keyword: "", needGroupResult: false }) });
  categoryLandmarks.push(...(response.landmarks ?? []));
});
const landmarks = [...new Map(categoryLandmarks.map((landmark) => [landmark.id, landmark])).values()];
if (landmarks.length < 1000) throw new Error(`Only ${landmarks.length} public markers found; refusing to write a partial offline map`);
const tileRoot = map.mapTileUrlsRoot;
const iconOutput = join(OUTPUT, "icons");
const mapOutput = join(OUTPUT, "map");
const tileOutput = join(mapOutput, "tiles", String(TILE_ZOOM));

await mkdir(OUTPUT, { recursive: true });

const palAssets = palsWithAssets.map((pal) => ({ url: pal._icon_source, file: join(iconOutput, basename(pal.icon)) }));
const categoryAssets = [...new Map(categories.filter((category) => category.iconUrl).map((category) => [category.id, category])).values()].map((category) => ({
  url: category.iconUrl,
  file: join(mapOutput, "icons", `${category.id}${extname(new URL(sourceUrl(category.iconUrl)).pathname) || ".png"}`),
  category,
}));
const tileAssets = [];
for (let x = TILE_RANGE.xStart; x <= TILE_RANGE.xEnd; x += 1) for (let y = TILE_RANGE.yStart; y <= TILE_RANGE.yEnd; y += 1) {
  const relative = `${x}_${y}.jpg`;
  tileAssets.push({ url: tileRoot.replace("{z}", String(TILE_ZOOM)).replace("{x}", String(x)).replace("{y}", String(y)), file: join(tileOutput, relative) });
}

console.log(`Downloading ${palAssets.length} Pal avatars, ${categoryAssets.length} map icons and ${tileAssets.length} map tiles…`);
await mapConcurrent([...palAssets, ...categoryAssets, ...tileAssets], 8, async (asset) => downloadAsset(asset.url, asset.file));

for (const pal of palsWithAssets) delete pal._icon_source;
const categoriesForClient = categoryAssets.map(({ category, file }) => ({ ...category, icon: `/data/palworld/map/icons/${basename(file)}` })).map(({ iconUrl, ...category }) => category);
const landmarkRecords = landmarks.map((landmark) => ({
  id: landmark.id,
  category_id: landmark.landmarkCatalogId,
  category: landmark.landmarkCatalogName,
  group: landmark.landmarkCatalogGroupName,
  name: landmark.name,
  description: landmark.description ?? "",
  x: landmark.x,
  y: landmark.y,
  z: landmark.z,
}));

await writeFile(join(OUTPUT, "pals.json"), `${JSON.stringify({
  schema_version: 3,
  generated_at: new Date().toISOString(),
  game_version: base.version?.version ?? "1.0",
  source: {
    provider: "游民星空",
    website: "https://app.gamersky.com/tools/palworldwiki/list.html?appNavigationBarStyle=kNoneBar&type=pals",
    dataset: "Palworld 1.0 local game assets",
    dataset_updated: base.generatedJsAt ?? base.manifest?.generatedAt ?? null,
    note: "公开图鉴数据与头像的本地快照；面板运行时不会请求第三方图鉴接口。",
  },
  pals: palsWithAssets,
}, null, 2)}\n`);

await writeFile(join(mapOutput, "map.json"), `${JSON.stringify({
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source: { provider: "游民星空", website: MAP_WEBSITE, updated_at: map.updateTime ?? null, note: "公开互动地图的本地点位与中等清晰度底图快照。" },
  name: map.name,
  bounds: { west: -1.40625, east: 0, south: 0, north: 1.4061088354351595 },
  tile: { zoom: TILE_ZOOM, size: map.mapTileSize ?? 512, ...TILE_RANGE, path: `/data/palworld/map/tiles/${TILE_ZOOM}` },
  categories: categoriesForClient,
  areas: (map.gameMapAreas ?? []).map((area) => ({ name: area.name, x: area.x, y: area.y, zooms: area.visibleMapZoom ?? [] })),
  landmarks: landmarkRecords,
}, null, 2)}\n`);

console.log(`Wrote ${palsWithAssets.length} Pals and ${landmarkRecords.length} map landmarks to ${OUTPUT}`);

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const source = resolve(process.argv[2] ?? "");
const distributionSource = resolve(process.argv[3] ?? "");
const output = resolve(process.argv[4] ?? "frontend/public/companion");

if (!source || source === resolve("")) {
  throw new Error("Usage: node scripts/import-companion-data.mjs <PalEdit directory> <Paldex API directory> [output directory]");
}

const workNames = {
  EmitFlame: "生火", Watering: "浇水", Seeding: "播种", GenerateElectricity: "发电",
  Handcraft: "手工作业", Collection: "采集", Deforest: "伐木", Mining: "采矿",
  OilExtraction: "原油提炼", ProductMedicine: "制药", Cool: "冷却", Transport: "搬运", MonsterFarm: "牧场",
};

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function typeList(types) {
  return (types ?? []).filter((type) => type && type !== "None").map((type) => String(type).toLowerCase());
}

function mapCode(code, known) {
  if (known.has(code)) return code;
  return code.replace(/^(BOSS_|GYM_|RAID_)/i, "");
}

const palDir = join(source, "palworld_pal_edit", "resources", "data", "pals");
const names = await json(join(source, "palworld_pal_edit", "resources", "data", "zh-CN", "pals.json"));
const englishNames = await json(join(source, "palworld_pal_edit", "resources", "data", "en-GB", "pals.json"));
const palFiles = (await readdir(palDir)).filter((file) => file.endsWith(".json"));
const pals = [];

for (const file of palFiles) {
  const record = await json(join(palDir, file));
  // A Chinese display name is required for the Chinese-first panel. Newly added game entries
  // without a reviewed localization remain in the source set and appear after the next refresh.
  if (record.Human || !record.CodeName || /^(GYM_|BOSS_|RAID_)/i.test(record.CodeName) || !names[record.CodeName] || !Array.isArray(record.Type) || record.Type[0] === "None") continue;
  const work = Object.entries(record.Suitabilities ?? {})
    .filter(([, level]) => Number(level) > 0)
    .map(([key, level]) => ({ key, name: workNames[key] ?? key, level: Number(level) }));
  pals.push({
    code: record.CodeName,
    name: names[record.CodeName] ?? record.CodeName,
    english_name: englishNames[record.CodeName] ?? record.CodeName,
    types: typeList(record.Type),
    work,
    stats: record.Scaling ?? null,
    moves: Object.entries(record.Moveset ?? {}).map(([skill, level]) => ({ skill: skill.replace("EPalWazaID::", ""), level: Number(level) })),
    variant: /(_Dark|_Ice|_Fire|_Ground|_Water|_Electric|_Dragon|_Cryst|_Terra|_Noct|_Aqua|_Lux|_Ignis)$/.test(record.CodeName),
    boss: /^(BOSS_|GYM_|RAID_)/.test(record.CodeName),
  });
}

pals.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN") || a.code.localeCompare(b.code));
const known = new Set(pals.map((pal) => pal.code));

const distribution = await json(join(distributionSource, "src", "PaldexDistributionData.json"));
const rows = distribution[0]?.Rows ?? {};
const raw = [];
for (const [rowCode, row] of Object.entries(rows)) {
  const code = mapCode(rowCode, known);
  if (!known.has(code)) continue;
  for (const [phase, field] of [["day", "dayTimeLocations"], ["night", "nightTimeLocations"]]) {
    for (const location of row?.[field]?.locations ?? []) {
      if (Number.isFinite(location.X) && Number.isFinite(location.Y)) raw.push({ code, phase, x: location.X, y: location.Y, radius: Number(row?.[field]?.Radius ?? 0) });
    }
  }
}

const bounds = raw.reduce((result, point) => ({
  min_x: Math.min(result.min_x, point.x), max_x: Math.max(result.max_x, point.x),
  min_y: Math.min(result.min_y, point.y), max_y: Math.max(result.max_y, point.y),
}), { min_x: Infinity, max_x: -Infinity, min_y: Infinity, max_y: -Infinity });

// Keep one point per 56 x 56 cell per Pal and time period. It preserves habitats while keeping
// the browser payload and DOM work practical on small hosts.
const cells = new Set();
const points = [];
for (const point of raw) {
  const x = (point.x - bounds.min_x) / (bounds.max_x - bounds.min_x || 1);
  const y = 1 - (point.y - bounds.min_y) / (bounds.max_y - bounds.min_y || 1);
  const cell = `${point.code}:${point.phase}:${Math.floor(x * 56)}:${Math.floor(y * 56)}`;
  if (cells.has(cell)) continue;
  cells.add(cell);
  points.push({ code: point.code, phase: point.phase, x: Number(x.toFixed(5)), y: Number(y.toFixed(5)), radius: point.radius });
}

await mkdir(output, { recursive: true });
await writeFile(join(output, "pals.json"), `${JSON.stringify({
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source: { repository: "https://github.com/EternalWraith/PalEdit", license: "MIT" },
  pals,
}, null, 2)}\n`);
await writeFile(join(output, "distributions.json"), `${JSON.stringify({
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source: { repository: "https://github.com/mlg404/palworld-paldex-api", license: "MIT" },
  bounds,
  points,
}, null, 2)}\n`);

console.log(`Wrote ${pals.length} pals and ${points.length} habitat points to ${output}`);

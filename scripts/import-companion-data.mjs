import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const DEFAULT_SOURCE = "https://www.palworld.tools/data/pals-index.json";
const sourceUrl = process.argv[2] ?? DEFAULT_SOURCE;
const output = resolve(process.argv[3] ?? "frontend/public/companion");
const outputFile = join(output, "pals.json");

const typeKeys = {
  Neutral: "neutral", Fire: "fire", Water: "water", Electric: "electricity", Electricity: "electricity",
  Grass: "leaf", Leaf: "leaf", Ice: "ice", Ground: "earth", Earth: "earth", Dark: "dark", Dragon: "dragon",
};

const workNames = {
  Handiwork: "手工作业", Watering: "浇水", Planting: "播种", "Generating Electricity": "发电",
  Transporting: "搬运", Gathering: "采集", Lumbering: "伐木", Mining: "采矿",
  "Medicine Production": "制药", Cooling: "冷却", Farming: "牧场", Kindling: "生火", OilExtraction: "原油提炼",
};

async function previousChineseNames() {
  if (!existsSync(outputFile)) return new Map();
  try {
    const previous = JSON.parse(await readFile(outputFile, "utf8"));
    return new Map((previous.pals ?? []).flatMap((pal) => {
      const name = pal.name_zh ?? (pal.english_name && pal.name !== pal.english_name ? pal.name : null);
      return name ? [[pal.code, name]] : [];
    }));
  } catch {
    return new Map();
  }
}

const response = await fetch(sourceUrl, {
  headers: { "user-agent": "PalworldServerManager companion-data refresh" },
});
if (!response.ok) throw new Error(`Unable to download Palworld.tools index: HTTP ${response.status}`);
const source = await response.json();
if (!Array.isArray(source)) throw new Error("Unexpected Palworld.tools index format");

const chineseNames = await previousChineseNames();
const pals = source
  .filter((pal) => Number(pal.paldex) > 0 && !pal.boss && !pal.raid)
  .map((pal) => ({
    code: pal.code,
    paldex: Number(pal.paldex),
    suffix: pal.suffix ?? "",
    name: pal.name,
    name_zh: chineseNames.get(pal.code) ?? null,
    english_name: pal.name,
    types: (pal.elements ?? []).map((element) => typeKeys[element] ?? String(element).toLowerCase()),
    work: (pal.suits ?? []).map((suit) => ({ key: suit, name: workNames[suit] ?? suit, level: null })),
    stats: Array.isArray(pal.st) ? {
      HP: pal.st[0], ATK: pal.st[1], DEF: pal.st[2], RUN: pal.st[3], SPRINT: pal.st[4], PRICE: pal.st[5],
    } : null,
    moves: [],
    variant: Boolean(pal.suffix),
    boss: false,
    rarity: pal.rarity ?? null,
    size: pal.size ?? null,
    genus: pal.genus ?? null,
    temperament: pal.tm ?? null,
    slug: pal.slug ?? null,
    source_url: pal.slug ? `https://www.palworld.tools/pals/${pal.slug}` : "https://www.palworld.tools/pals",
  }))
  .sort((a, b) => a.paldex - b.paldex || a.suffix.localeCompare(b.suffix) || a.name.localeCompare(b.name));

if (pals.length < 280) throw new Error(`Only ${pals.length} playable Pals found; refusing to overwrite the catalog`);

await mkdir(output, { recursive: true });
await writeFile(outputFile, `${JSON.stringify({
  schema_version: 2,
  generated_at: new Date().toISOString(),
  game_version: "1.0",
  source: {
    website: "https://www.palworld.tools/pals",
    dataset: DEFAULT_SOURCE,
    dataset_updated: "2026-07-13",
    note: "Public Palworld.tools index snapshot. Chinese labels are retained only where a reviewed legacy label already exists.",
  },
  pals,
}, null, 2)}\n`);

console.log(`Wrote ${pals.length} current Pal entries to ${outputFile}`);

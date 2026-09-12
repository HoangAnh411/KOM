import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const outDir = path.join(rootDir, "apps", "client", "public", "assets", "city3d", "temp", "kenney-v1");

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const sourceRoots = {
  fantasy: option("fantasy"),
  castle: option("castle"),
  characters: option("characters"),
};

if (!sourceRoots.fantasy || !sourceRoots.castle || !sourceRoots.characters) {
  throw new Error("Usage: node scripts/import-city-assets.mjs --fantasy <Fantasy Town Kit root> --castle <Castle Kit root> --characters <Mini Characters root>");
}

const files = {
  fantasy: [
    "banner-green", "banner-red", "cart", "chimney", "fence", "fountain-round-detail",
    "lantern", "overhang", "planks", "poles", "road", "road-bend", "road-corner",
    "rock-large", "rock-small", "roof", "roof-flat", "roof-high", "stairs-stone",
    "stairs-wood", "stall-green", "stall-red", "tree", "tree-crooked", "tree-high-round",
    "wall", "wall-door", "wall-window-shutters", "wall-wood", "wall-wood-door",
    "wall-wood-window-shutters",
  ],
  castle: [
    "flag-banner-long", "flag", "gate", "metal-gate", "tower-square",
    "tower-square-top-roof-high", "wall", "wall-corner", "wall-narrow-gate", "wall-pillar",
  ],
  characters: ["character-female-a", "character-male-a"],
};

function glbDirectory(root) {
  const candidates = [
    path.join(root, "Models", "GLB format"),
    path.join(root, "GLB format"),
  ];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw new Error(`Cannot find a GLB format directory under ${root}`);
  return found;
}

if (!outDir.startsWith(path.join(rootDir, "apps", "client", "public", "assets", "city3d", "temp")) || path.basename(outDir) !== "kenney-v1") {
  throw new Error(`Refusing to replace unexpected output directory: ${outDir}`);
}
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const index = {
  assetSetId: "temp-kenney-v1",
  generatedAt: new Date().toISOString(),
  sources: {
    fantasy: "https://kenney.nl/assets/fantasy-town-kit (2.0, CC0 1.0)",
    castle: "https://kenney.nl/assets/castle-kit (2.0, CC0 1.0)",
    characters: "https://kenney.nl/assets/mini-characters (1.0, CC0 1.0)",
  },
  files: {},
};

for (const [pack, names] of Object.entries(files)) {
  const sourceDir = glbDirectory(sourceRoots[pack]);
  const packOutDir = path.join(outDir, pack);
  fs.mkdirSync(packOutDir, { recursive: true });
  fs.cpSync(path.join(sourceDir, "Textures"), path.join(packOutDir, "Textures"), { recursive: true });
  for (const name of names) {
    const source = path.join(sourceDir, `${name}.glb`);
    if (!fs.existsSync(source)) throw new Error(`Missing source asset: ${source}`);
    const filename = `${pack}/${name}.glb`;
    const destination = path.join(outDir, filename);
    fs.copyFileSync(source, destination);
    const bytes = fs.readFileSync(destination);
    index.files[`${pack}.${name}`] = {
      filename,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
}

fs.writeFileSync(path.join(outDir, "asset-index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Imported ${Object.keys(index.files).length} authored GLB assets into ${outDir}`);

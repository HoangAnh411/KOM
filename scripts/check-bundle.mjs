import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Phase 7C bundle gate: no JavaScript file shipped by the current Vite build
// (per dist-web/.vite/manifest.json) may exceed 500 KiB minified. Manifest-based
// so stale chunks from older builds are never counted.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "apps", "client", "dist-web");
const defaultLimit = 500 * 1024;
const threeLimit = 750 * 1024;

const manifestPath = join(outDir, ".vite", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const appEntry = Object.values(manifest).find(entry => entry.isEntry);
const threeKey = Object.keys(manifest).find(key => manifest[key]?.name === "three");
if (!appEntry || !threeKey || (appEntry.imports ?? []).includes(threeKey)) {
  console.error("City renderer gate failed: Three.js must not be a static dependency of the application entry.");
  process.exit(1);
}
if (!(appEntry.dynamicImports ?? []).some(key => key.endsWith("/CityView.tsx"))) {
  console.error("City renderer gate failed: CityView must remain a lazy dynamic entry.");
  process.exit(1);
}
if (!(appEntry.dynamicImports ?? []).some(key => key.endsWith("/world-3d/scene.ts"))) {
  console.error("World renderer gate failed: the Three.js world must remain a lazy dynamic entry.");
  process.exit(1);
}

const files = new Set();
for (const entry of Object.values(manifest)) {
  files.add(entry.file);
  for (const importKey of entry.imports ?? []) files.add(manifest[importKey]?.file);
}
const jsFiles = [...files].filter(file => typeof file === "string" && file.endsWith(".js"));

if (jsFiles.length === 0) {
  console.error("No JS chunks in manifest — run `npm run build -w @kingdoms/client` first.");
  process.exit(1);
}

let failed = false;
for (const file of jsFiles.sort()) {
  const size = (await stat(join(outDir, file))).size;
  const fileLimit = file.includes("three") ? threeLimit : defaultLimit;
  const display = (size / 1024).toFixed(1);
  const flag = size > fileLimit ? "✗ TOO LARGE" : "ok";
  if (size > fileLimit) failed = true;
  console.log(`${flag.padEnd(12)} ${display.padStart(9)} KiB  ${file} (limit ${Math.round(fileLimit / 1024)} KiB)`);
}
if (failed) {
  console.error("\nBundle gate failed: a chunk exceeds its size limit.");
  process.exit(1);
}
console.log(`\nAll ${jsFiles.length} shipped chunks within their size limits.`);

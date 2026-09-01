import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Phase 7C bundle gate: no JavaScript file shipped by the current Vite build
// (per dist-web/.vite/manifest.json) may exceed 500 KiB minified. Manifest-based
// so stale chunks from older builds are never counted.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "apps", "client", "dist-web");
const limit = 500 * 1024;

const manifestPath = join(outDir, ".vite", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

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
  const display = (size / 1024).toFixed(1);
  const flag = size > limit ? "✗ TOO LARGE" : "ok";
  if (size > limit) failed = true;
  console.log(`${flag.padEnd(12)} ${display.padStart(9)} KiB  ${file}`);
}
if (failed) {
  console.error(`\nBundle gate failed: a chunk exceeds ${Math.round(limit / 1024)} KiB.`);
  process.exit(1);
}
console.log(`\nAll ${jsFiles.length} shipped chunks within ${Math.round(limit / 1024)} KiB.`);
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = (name: string): string => readFileSync(resolve(root, "src", name), "utf8");
const fallback = source("city-3d/fallback.tsx");
const cityView = source("components/CityView.tsx");
const mapSurface = source("components/MapSurface.tsx");
const menu = source("components/MenuModal.tsx");
const styles = source("styles.css");
const world2d = source("world-2d.ts");

test("2D city fallback exposes a named keyboard grid", () => {
  assert.match(fallback, /<section[^>]+aria-labelledby=/);
  assert.match(fallback, /role="grid"/);
  assert.match(fallback, /role="gridcell"/);
  assert.match(fallback, /tabIndex=\{focusedCell === index \? 0 : -1\}/);
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    assert.ok(fallback.includes(`event.key === "${key}"`), `${key} navigation is missing`);
  }
  assert.match(fallback, /Enter hoặc Space/);
  assert.match(fallback, /gameRules\.buildings\[building\.buildingId\]\.name/);
});

test("city view restores focus and copy documents keyboard controls", () => {
  assert.match(cityView, /const restoreTo = document\.activeElement/);
  assert.match(cityView, /if \(restoreTo\?\.isConnected\) restoreTo\.focus\(\)/);
  assert.match(menu, /Điều khiển và phím tắt/);
  assert.match(menu, /Tab \/ Shift \+ Tab/);
  assert.doesNotMatch(menu, />Shop<|>Menu<|Lv\./);
});

test("world navigation remains keyboard-operable without WebGL or canvas", () => {
  assert.match(mapSurface, /<details className="world-map-alternatives">/);
  assert.match(mapSurface, /role="button" tabIndex=\{0\}/);
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"]) {
    assert.ok(mapSurface.includes(`event.key === "${key}"`), `${key} minimap navigation is missing`);
  }
  assert.match(world2d, /surface\.dataset\.worldRenderer = "list"/);
  assert.match(world2d, /aria-label", "Bản đồ thế giới dạng danh sách"/);
  assert.match(world2d, /document\.createElement\("button"\)/);
});

test("viewport, safe-area, focus, and forced-colors fallbacks stay present", () => {
  assert.match(styles, /height:\s*100vh;\s*height:\s*100dvh/);
  assert.match(styles, /env\(safe-area-inset-(?:top|right|bottom|left)\)/);
  assert.match(styles, /\.city-2d-cell:focus-visible/);
  assert.match(styles, /@media \(forced-colors:\s*active\)/);
});

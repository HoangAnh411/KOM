import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
const modal = read("../src/ui/Modal.tsx");
const cityView = read("../src/components/CityView.tsx");
const cityScene = read("../src/city-3d/scene.ts");
const state = read("../src/state.tsx");

test("gameplay hotkeys stand down while a modal is open", () => {
  assert.match(modal, /export function isModalOpen\(\)/);
  assert.match(cityView, /if \(isModalOpen\(\)\) return;/);
  assert.match(cityScene, /const onKeyDown = \(event: KeyboardEvent\) => \{\s*if \(isModalOpen\(\)\) return;/);
});

test("settling any cosmetic retry refreshes the authoritative player hub", () => {
  assert.match(state, /const refreshPlayerHub = useCallback/);
  assert.match(state, /response\.result !== "rejected"/);
  assert.match(state, /refreshPlayerHub\(\);/);
  assert.match(state, /api\.playerHub\(token\)/);
});

test("a completed pinch cannot fall through to selection or building movement", () => {
  assert.match(cityScene, /let gestureHadPinch = false;/);
  assert.match(cityScene, /if \(activePointers\.size >= 2\) gestureHadPinch = true;/);
  const pointerUp = cityScene.slice(cityScene.indexOf("const onPointerUp"), cityScene.indexOf("const onWheel"));
  assert.match(pointerUp, /if \(gestureHadPinch\) \{[\s\S]*?if \(activePointers\.size === 0\) \{[\s\S]*?gestureHadPinch = false;[\s\S]*?return;/);
  assert.ok(pointerUp.indexOf("if (gestureHadPinch)") < pointerUp.indexOf("options.onBuildingMoved"));
  assert.ok(pointerUp.indexOf("if (gestureHadPinch)") < pointerUp.indexOf("options.onSelectBuilding"));
});

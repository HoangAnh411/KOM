import assert from "node:assert/strict";
import test from "node:test";
import type { BuildingId, FactionId } from "@kingdoms/shared";
import { CITY_ASSET_LOAD_CONCURRENCY, mapWithConcurrency } from "./city-3d/loader.js";
import { citySceneContentSignatures, type CitySceneOptions } from "./city-3d/types.js";

const buildingId = "town_hall" as BuildingId;
const options = (overrides: Partial<CitySceneOptions> = {}): CitySceneOptions => ({
  cityId: "city-1",
  factionId: "meridian" as FactionId,
  gridSize: 16,
  townHallLevel: 1,
  buildings: [{ buildingId, level: 1, x: 2, y: 3, rotation: 0 }],
  selectedBuildingId: null,
  mode: "view",
  placementDraft: null,
  quality: "high",
  onSelectBuilding: () => undefined,
  ...overrides,
});

test("city asset tasks never exceed the four-load concurrency limit", async () => {
  let active = 0;
  let peak = 0;
  let release: (() => void) | undefined;
  let gate = new Promise<void>(resolve => { release = resolve; });
  let started = 0;
  const run = mapWithConcurrency(Array.from({ length: 12 }, (_, index) => index), CITY_ASSET_LOAD_CONCURRENCY, async value => {
    active += 1;
    started += 1;
    peak = Math.max(peak, active);
    if (started === CITY_ASSET_LOAD_CONCURRENCY) release?.();
    await gate;
    gate = Promise.resolve();
    active -= 1;
    return value * 2;
  });
  assert.deepEqual(await run, Array.from({ length: 12 }, (_, index) => index * 2));
  assert.equal(peak, 4);
});

test("city signatures ignore references and callbacks but isolate content changes", () => {
  const base = options();
  const initial = citySceneContentSignatures(base);
  assert.deepEqual(citySceneContentSignatures({
    ...base,
    buildings: base.buildings.map(building => ({ ...building })),
    onSelectBuilding: () => undefined,
    onContextLost: () => undefined,
  }), initial);

  const moved = citySceneContentSignatures(options({ buildings: [{ ...base.buildings[0]!, x: 4 }] }));
  assert.notEqual(moved.topology, initial.topology);
  assert.equal(moved.visual, initial.visual);

  const upgraded = citySceneContentSignatures(options({ buildings: [{ ...base.buildings[0]!, level: 2 }] }));
  assert.equal(upgraded.topology, initial.topology);
  assert.notEqual(upgraded.visual, initial.visual);

  const selected = citySceneContentSignatures(options({ selectedBuildingId: buildingId }));
  assert.equal(selected.static, initial.static);
  assert.equal(selected.topology, initial.topology);
  assert.equal(selected.visual, initial.visual);
  assert.notEqual(selected.overlay, initial.overlay);
});

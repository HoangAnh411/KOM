import test from "node:test";
import assert from "node:assert/strict";
import { overallScore, militaryScore, gameRules, recruitmentCost, snapshotSchema, PROTOCOL_VERSION, regionTileCounts, regions, buildCommandSchema, cityGridSize, buildingDimensions, validatePlacements, migrateCityLayoutV1toV2 } from "./index.js";

test("season score uses the published weights", () => {
  assert.equal(overallScore({ military: 1000, economy: 1000, diplomacy: 1000 }), 1000);
  assert.equal(overallScore({ military: 100, economy: 200, diplomacy: 300 }), 185);
});

test("military score calculation", () => {
  // `tilesControlled` used to be 100 here, which maxed the territory term under the old flat
  // rate of 5 points a tile. That rate saturated at 60 tiles — less than one of the sixteen
  // provinces — so the fixture for "everything maxed" is now the tile count that actually means
  // maxed: a quarter of the world.
  assert.equal(militaryScore({ victories: 10, draws: 0, tilesControlled: gameRules.territory.fullScoreTiles, successfulDefenses: 10 }), 1000);
  const oneProvince = gameRules.territory.fullScoreTiles / 4;
  assert.equal(militaryScore({ victories: 2, draws: 1, tilesControlled: oneProvince, successfulDefenses: 1 }), 225); // 110 + 75 (one province) + 40
});

// The scale, checked against the map it is scaled against. Holding one of the sixteen provinces
// is a quarter of the way to the cap; under the old rate it *was* the cap (79 × 5 = 395, clamped
// to 300), which made three tenths of the military axis a switch with two positions.
test("one province is worth about 75 territory points, not the whole 300", () => {
  const counts = regionTileCounts();
  const territoryOnly = (tilesControlled: number) => militaryScore({ victories: 0, draws: 0, tilesControlled, successfulDefenses: 0 });
  for (const region of regions) {
    const score = territoryOnly(counts[region.code]!);
    assert.ok(score >= 70 && score <= 80, `${region.name} (${counts[region.code]} ô) pays ${score}, expected about 75`);
  }
  assert.equal(territoryOnly(gameRules.territory.fullScoreTiles), 300, "a quarter of the world is the full territory score");
  assert.equal(territoryOnly(gameRules.territory.fullScoreTiles * 2), 300, "and there is nothing above it");
  assert.equal(gameRules.territory.fullScoreTiles, (gameRules.map.extent * gameRules.map.extent) / 4);
});

test("recruitment is priced per 10-troop pack, matching the server charge", () => {
  const step = gameRules.army.recruitAmountStep;
  const infantry = gameRules.recruitment.infantry.cost;
  assert.deepEqual(recruitmentCost("infantry", step), infantry);
  assert.deepEqual(recruitmentCost("infantry", step * 5), { wood: infantry.wood * 5, stone: infantry.stone * 5, iron: infantry.iron * 5 });
  assert.equal(gameRules.recruitment.infantry.cost.wood, 50);
});

test("town hall levels expand the authoritative city grid up to its cap", () => {
  assert.equal(cityGridSize(1), 12);
  assert.equal(cityGridSize(2), 14);
  assert.equal(cityGridSize(5), 20);
  assert.equal(cityGridSize(99), 20);
});

test("a build plot must provide both coordinates, and rotation only with coordinates", () => {
  const base = { commandId: "command-plot-1", cityId: "city-1", buildingId: "warehouse", queueType: "build" };
  assert.equal(buildCommandSchema.safeParse({ ...base, plotX: 1 }).success, false);
  assert.equal(buildCommandSchema.safeParse({ ...base, plotX: 1, plotY: 3 }).success, true);
  assert.equal(buildCommandSchema.safeParse({ ...base, plotX: 1, plotY: 3, plotRotation: 90 }).success, true);
  assert.equal(buildCommandSchema.safeParse({ ...base, plotRotation: 90 }).success, false);
  assert.equal(buildCommandSchema.safeParse({ ...base, plotX: 1, plotY: 3, plotRotation: 45 }).success, false);
});

test("footprint dimensions and rotation swap width and height for 90 and 270 degrees", () => {
  assert.deepEqual(buildingDimensions("road_depot", 0), { width: 3, height: 2 });
  assert.deepEqual(buildingDimensions("road_depot", 90), { width: 2, height: 3 });
  assert.deepEqual(buildingDimensions("road_depot", 180), { width: 3, height: 2 });
  assert.deepEqual(buildingDimensions("road_depot", 270), { width: 2, height: 3 });
  assert.deepEqual(buildingDimensions("town_hall", 90), { width: 3, height: 3 });
});

test("validatePlacements detects out-of-bounds, overlaps, and invalid rotations", () => {
  const valid = [
    { buildingId: "town_hall" as const, x: 4, y: 4, rotation: 0 as const },
    { buildingId: "warehouse" as const, x: 0, y: 0, rotation: 0 as const },
    { buildingId: "road_depot" as const, x: 8, y: 4, rotation: 90 as const }, // 2 wide, 3 high -> x: 8..9, y: 4..6
  ];
  assert.deepEqual(validatePlacements(valid, 12), { valid: true });

  // Out of bounds
  const outOfBounds = [{ buildingId: "barracks" as const, x: 10, y: 10, rotation: 0 as const }]; // 3x3 at 10 -> reaches 13 > 12
  assert.equal(validatePlacements(outOfBounds, 12).error, "CITY_PLOT_OUT_OF_BOUNDS");

  // Overlap
  const overlap = [
    { buildingId: "town_hall" as const, x: 4, y: 4, rotation: 0 as const },
    { buildingId: "warehouse" as const, x: 5, y: 5, rotation: 0 as const },
  ];
  assert.equal(validatePlacements(overlap, 12).error, "CITY_PLOT_OCCUPIED");
});

test("migrateCityLayoutV1toV2 deterministically projects v1 layout into v2 grid", () => {
  const legacyCity = {
    buildings: { town_hall: 1, warehouse: 1 },
    buildingPlots: [
      { buildingId: "town_hall" as const, x: 2, y: 2 },
      { buildingId: "warehouse" as const, x: 1, y: 2 },
    ],
  };
  const migrated = migrateCityLayoutV1toV2(legacyCity);
  assert.equal(migrated.length, 2);
  const th = migrated.find(p => p.buildingId === "town_hall")!;
  assert.deepEqual(th, { buildingId: "town_hall", x: 4, y: 4, rotation: 0 });
  const wh = migrated.find(p => p.buildingId === "warehouse")!;
  assert.ok(wh.x >= 0 && wh.y >= 0 && wh.rotation === 0);
  assert.deepEqual(validatePlacements(migrated, 12), { valid: true });
});

// The snapshot used to carry the world tile by tile. Both sides now import the authored
// map from `world-map.ts`, so the contract only has to *name* which world it is
// (`worldMapDigest`) and list what the DB says differs from it (`terrainOverrides`).
test("the snapshot contract names the world instead of carrying it", () => {
  const keys = Object.keys(snapshotSchema.shape);
  assert.ok(!keys.includes("terrainMap"), "the tile-by-tile grid is off the wire");
  assert.ok(keys.includes("worldMapDigest") && keys.includes("terrainOverrides"), "what replaced it");
  assert.ok(keys.includes("world") && keys.includes("exploration"), "the 3D asset world and seasonal fog are explicit protocol fields");
});

test("PROTOCOL_VERSION is 4 for the 256 world descriptor and seasonal exploration", () => {
  assert.equal(PROTOCOL_VERSION, 4);
});

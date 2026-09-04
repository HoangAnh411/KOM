import test from "node:test";
import assert from "node:assert/strict";
import { overallScore, militaryScore, gameRules, recruitmentCost, snapshotSchema, PROTOCOL_VERSION, regionTileCounts, regions } from "./index.js";

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
  assert.equal(militaryScore({ victories: 2, draws: 1, tilesControlled: 81, successfulDefenses: 1 }), 225); // 110 + 75 (one province) + 40
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

// The snapshot used to carry the world tile by tile. Both sides now import the authored
// map from `world-map.ts`, so the contract only has to *name* which world it is
// (`worldMapDigest`) and list what the DB says differs from it (`terrainOverrides`).
test("the snapshot contract names the world instead of carrying it", () => {
  const keys = Object.keys(snapshotSchema.shape);
  assert.ok(!keys.includes("terrainMap"), "the tile-by-tile grid is off the wire");
  assert.ok(keys.includes("worldMapDigest") && keys.includes("terrainOverrides"), "what replaced it");
});

// Why the bump is not optional. Zod strips unknown keys, so a v1 payload parses
// *cleanly* against the v2 contract and simply arrives without its terrain — and a
// missing tile reads as plains on the client. Nothing throws, nothing logs: the
// mismatch would show up as a world that is quietly all grassland while the server
// resolves battles on hills and swamp. `PROTOCOL_VERSION` is what turns that silence
// into a message, which is why it moved with the field and not after it.
test("a v1 payload loses its terrain silently, which is what PROTOCOL_VERSION 2 exists to stop", () => {
  const terrainOnly = snapshotSchema.pick({ protocolVersion: true, worldMapDigest: true, terrainOverrides: true });
  assert.deepEqual(terrainOnly.parse({ protocolVersion: 1, terrainMap: { "3,4": "swamp" } }), { protocolVersion: 1 });
  assert.equal(PROTOCOL_VERSION, 2, "the version terrain left the wire on");
});

import test from "node:test";
import assert from "node:assert/strict";
import { overallScore, militaryScore, gameRules, recruitmentCost, snapshotSchema, PROTOCOL_VERSION } from "./index.js";

test("season score uses the published weights", () => {
  assert.equal(overallScore({ military: 1000, economy: 1000, diplomacy: 1000 }), 1000);
  assert.equal(overallScore({ military: 100, economy: 200, diplomacy: 300 }), 185);
});

test("military score calculation", () => {
  assert.equal(militaryScore({ victories: 10, draws: 0, tilesControlled: 100, successfulDefenses: 10 }), 1000);
  assert.equal(militaryScore({ victories: 2, draws: 1, tilesControlled: 5, successfulDefenses: 1 }), 175); // 110 + 25 + 40
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

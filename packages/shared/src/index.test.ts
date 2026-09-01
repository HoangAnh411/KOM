import test from "node:test";
import assert from "node:assert/strict";
import { overallScore, militaryScore, gameRules, recruitmentCost } from "./index.js";

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

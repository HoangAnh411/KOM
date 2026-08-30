import test from "node:test";
import assert from "node:assert/strict";
import { overallScore, militaryScore } from "./index.js";

test("season score uses the published weights", () => {
  assert.equal(overallScore({ military: 1000, economy: 1000, diplomacy: 1000 }), 1000);
  assert.equal(overallScore({ military: 100, economy: 200, diplomacy: 300 }), 185);
});

test("military score calculation", () => {
  assert.equal(militaryScore({ victories: 10, draws: 0, tilesControlled: 100, successfulDefenses: 10 }), 1000);
  assert.equal(militaryScore({ victories: 2, draws: 1, tilesControlled: 5, successfulDefenses: 1 }), 175); // 110 + 25 + 40
});

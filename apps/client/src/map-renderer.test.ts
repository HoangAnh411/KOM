import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRolloutPercent, resolveMapRenderer, stableRolloutBucket } from "./map-renderer.js";

test("renderer setting defaults invalid and missing values to Pixi", () => {
  assert.equal(resolveMapRenderer({ playerId: "player-a" }), "pixi");
  assert.equal(resolveMapRenderer({ playerId: "player-a", setting: "unknown", rolloutPercent: 100 }), "pixi");
  assert.equal(resolveMapRenderer({ playerId: "player-a", setting: "pixi", rolloutPercent: 100 }), "pixi");
});

test("explicit Three bypasses rollout percentage", () => {
  assert.equal(resolveMapRenderer({ playerId: "player-a", setting: "three", rolloutPercent: 0 }), "three");
});

test("auto rollout is sticky and observes the percentage boundaries", () => {
  const playerId = "0efda990-5d88-4bc6-a2d8-c67db29172be";
  const bucket = stableRolloutBucket(playerId);
  assert.equal(stableRolloutBucket(playerId), bucket);
  assert.ok(bucket >= 0 && bucket < 100);
  assert.equal(resolveMapRenderer({ playerId, setting: "auto", rolloutPercent: 0 }), "pixi");
  assert.equal(resolveMapRenderer({ playerId, setting: "auto", rolloutPercent: 100 }), "three");
  assert.equal(resolveMapRenderer({ playerId, setting: "auto", rolloutPercent: bucket }), "pixi");
  assert.equal(resolveMapRenderer({ playerId, setting: "auto", rolloutPercent: bucket + 1 }), "three");
});

test("rollout percentages are finite integers clamped to 0 through 100", () => {
  assert.equal(normalizeRolloutPercent(undefined), 0);
  assert.equal(normalizeRolloutPercent("not-a-number"), 0);
  assert.equal(normalizeRolloutPercent(-12), 0);
  assert.equal(normalizeRolloutPercent("12.9"), 12);
  assert.equal(normalizeRolloutPercent(120), 100);
});

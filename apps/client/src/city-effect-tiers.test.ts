import assert from "node:assert/strict";
import test from "node:test";
import { cityEffectTierFor } from "./city-3d/effect-tiers.js";

// The city tier table's contract, held the same way the world's is: orderings,
// not values, so tuning a duration does not break the law the scene relies on.

test("plaza lights are desktop-only, the glow marker is not", () => {
  assert.equal(cityEffectTierFor("high").lanternLights, true);
  assert.equal(cityEffectTierFor("medium").lanternLights, false);
  assert.equal(cityEffectTierFor("low").lanternLights, false);
  assert.equal(cityEffectTierFor("high").lanternGlow, true);
  assert.equal(cityEffectTierFor("medium").lanternGlow, true);
});

test("every tier animates a finished build, low just faster", () => {
  for (const quality of ["high", "medium", "low"] as const) {
    const tier = cityEffectTierFor(quality);
    assert.equal(tier.buildAnimation, true, `${quality} dropped the build animation`);
    assert.ok(tier.buildAnimationMs > 0);
  }
  assert.ok(cityEffectTierFor("low").buildAnimationMs <= cityEffectTierFor("high").buildAnimationMs);
});

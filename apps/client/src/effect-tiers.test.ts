import assert from "node:assert/strict";
import test from "node:test";
import type { GraphicsQuality } from "./graphics.js";
import { effectTierFor } from "./world-3d/effect-tiers.js";

// The tier table is the contract the renderer leans on: a weak device must
// never be handed a heavy effect, and "high" may only ever add cost over
// "balanced". These orderings are asserted rather than the values, so tuning a
// shadow map size does not break the test that matters.

const qualities: GraphicsQuality[] = ["high", "balanced", "low"];

test("low never pays for tone mapping, animated water, sky gradient or bloom", () => {
  const low = effectTierFor("low");
  assert.equal(low.toneMapping, false);
  assert.equal(low.waterAnimation, false);
  assert.equal(low.sky, "solid");
  assert.equal(low.bloom, false);
  assert.equal(low.propShadows, false);
});

test("bloom and the full chip label style are high-only", () => {
  assert.equal(effectTierFor("high").bloom, true);
  assert.equal(effectTierFor("balanced").bloom, false);
  assert.equal(effectTierFor("high").labelStyle, "chip");
  assert.notEqual(effectTierFor("balanced").labelStyle, "chip");
  assert.notEqual(effectTierFor("low").labelStyle, "chip");
});

test("cost only ever rises from low through balanced to high", () => {
  const tiers = (["low", "balanced", "high"] as GraphicsQuality[]).map(effectTierFor);
  const weight = { low: 0, balanced: 1, high: 2 };
  const skyWeight = { solid: 0, gradient: 1 };
  for (let index = 1; index < tiers.length; index += 1) {
    const lighter = tiers[index - 1]!;
    const heavier = tiers[index]!;
    assert.ok(heavier.toneMapping >= lighter.toneMapping, "tone mapping may not go down a tier");
    assert.ok(Number(heavier.waterAnimation) >= Number(lighter.waterAnimation), "water animation may not go down a tier");
    assert.ok(skyWeight[heavier.sky] >= skyWeight[lighter.sky], "the sky may not get simpler going up a tier");
    assert.ok(heavier.shadowMapSize >= lighter.shadowMapSize, "shadow maps may not shrink going up a tier");
    assert.ok(heavier.propBudget >= lighter.propBudget, "the prop budget may not shrink going up a tier");
    assert.ok(Number(heavier.propShadows) >= Number(lighter.propShadows), "prop shadows may not appear going down a tier");
  }
});

test("animated water always comes with a positive speed, still water with none", () => {
  for (const quality of qualities) {
    const tier = effectTierFor(quality);
    if (tier.waterAnimation) assert.ok(tier.waterAnimationSpeed > 0);
    else assert.equal(tier.waterAnimationSpeed, 0);
  }
});

test("shadow map sizes are powers of two the renderer can address directly", () => {
  for (const quality of qualities) {
    const size = effectTierFor(quality).shadowMapSize;
    assert.ok([512, 1024, 2048].includes(size), `${quality} uses an off-scale shadow map`);
  }
});

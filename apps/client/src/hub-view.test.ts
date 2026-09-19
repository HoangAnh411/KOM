import assert from "node:assert/strict";
import test from "node:test";
import type { ClaimableCosmeticReward } from "@kingdoms/shared";
import { REPUTATION_RANK_STEP, hubTabs, previewToken, reputationMeter, rewardProgress, scoreMeters, slotIcons, slotLabels, slotPreviewClass } from "./components/hub-view.js";
import { iconNames } from "./ui/tokens.js";

// The hub's layout decisions live in `hub-view.ts` so this file can hold them
// to the same one-wording-one-glyph law the rest of the design system obeys —
// and so the meter arithmetic (0–1000 by scoreSchema) is checked where it is
// written, not discovered on a rendered bar.

const scores = { military: 500, economy: 250, diplomacy: 0, overall: 185 };

test("every score becomes a meter with a registered glyph and a Vietnamese label", () => {
  const meters = scoreMeters(scores);
  assert.deepEqual(meters.map(meter => meter.key), ["overall", "military", "economy", "diplomacy"], "overall leads");
  for (const meter of meters) {
    assert.ok(iconNames.includes(meter.icon), `${meter.key} maps to an unregistered icon`);
    assert.ok(meter.label.length > 0, `${meter.key} has no label`);
    assert.equal(/^[a-z]/.test(meter.label), false, `${meter.key} is still labelled with its protocol key`);
    assert.equal(meter.value, scores[meter.key]);
  }
});

test("meter fractions are the score against the 0–1000 contract, clamped", () => {
  const [overall, military, economy, diplomacy] = scoreMeters(scores);
  assert.equal(overall!.fraction, 0.185);
  assert.equal(military!.fraction, 0.5);
  assert.equal(economy!.fraction, 0.25);
  assert.equal(diplomacy!.fraction, 0);
  assert.equal(scoreMeters({ military: 2000, economy: 0, diplomacy: 0, overall: 2000 })[0]!.fraction, 1, "over-cap scores clamp");
});

test("reputation reads as a rank ladder with a full bar at each step boundary", () => {
  assert.deepEqual(reputationMeter(0), { rank: 1, fraction: 0 });
  assert.deepEqual(reputationMeter(REPUTATION_RANK_STEP), { rank: 2, fraction: 0 });
  assert.deepEqual(reputationMeter(REPUTATION_RANK_STEP * 3 - 1), { rank: 3, fraction: 0.996 });
  const climbed = reputationMeter(700);
  assert.ok(climbed.fraction > 0 && climbed.fraction < 1);
});

test("reward bars are a three-state signal: nothing, claimable, claimed", () => {
  const reward = (over: Partial<ClaimableCosmeticReward>): ClaimableCosmeticReward =>
    ({ id: "r", title: "T", amount: 10, eligible: false, claimed: false, ...over });
  assert.equal(rewardProgress(reward({})), 0);
  assert.equal(rewardProgress(reward({ eligible: true })), 1);
  assert.equal(rewardProgress(reward({ claimed: true })), 1);
});

test("preview tokens are normalised before they reach a class attribute", () => {
  assert.equal(previewToken("frame_brass"), "frame-brass");
  assert.equal(previewToken("Flag Ember!!"), "flag-ember");
  assert.equal(previewToken("---"), "default", "a punctuation-only preview must not emit an empty class token");
  assert.equal(slotPreviewClass("avatar_frame", "frame_brass"), "hub-preview-v2 hub-preview-v2--avatar_frame hub-preview-v2--avatar_frame-frame-brass");
});

test("slots and tabs carry one glyph and one wording each", () => {
  for (const slot of Object.keys(slotIcons) as Array<keyof typeof slotIcons>) {
    assert.ok(iconNames.includes(slotIcons[slot]), `${slot} maps to an unregistered icon`);
    assert.ok(slotLabels[slot].length > 0);
  }
  assert.deepEqual(hubTabs.map(tab => tab.id), ["profile", "inventory", "shop"]);
  const tabLabels = hubTabs.map(tab => tab.label);
  assert.equal(new Set(tabLabels).size, tabLabels.length, "two tabs share a wording");
  for (const tab of hubTabs) assert.ok(iconNames.includes(tab.icon), `${tab.id} maps to an unregistered icon`);
});

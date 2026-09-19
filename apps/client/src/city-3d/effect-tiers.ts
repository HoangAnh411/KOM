// The city scene's effect budget per quality, pure data for the same reason
// as `world-3d/effect-tiers.ts`: the bare node runner can hold the ordering
// (lights only on high, the build animation everywhere) without a WebGL
// context. `CityQuality` keeps its "medium" name — it predates the shared
// high/balanced/low vocabulary and `CitySceneOptions` is its contract.

import type { CityQuality } from "./types.js";

export type CityEffectTier = {
  /** Real point lights at the plaza lanterns. Four extra lights recompile
   *  every standard material in the scene, so they are desktop-only. */
  lanternLights: boolean;
  /** A cheap emissive marker inside each lantern so the lamps read as lit on
   *  every tier, with or without the light itself. */
  lanternGlow: boolean;
  /** Rise-and-settle pop when a building appears or levels up. */
  buildAnimation: boolean;
  buildAnimationMs: number;
};

export const cityEffectTierFor = (quality: CityQuality): CityEffectTier => quality === "high"
  ? { lanternLights: true, lanternGlow: true, buildAnimation: true, buildAnimationMs: 450 }
  : quality === "medium"
    ? { lanternLights: false, lanternGlow: true, buildAnimation: true, buildAnimationMs: 450 }
    : { lanternLights: false, lanternGlow: false, buildAnimation: true, buildAnimationMs: 300 };

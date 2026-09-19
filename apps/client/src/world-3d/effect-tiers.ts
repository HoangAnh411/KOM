// The world scene's effect budget per graphics quality, as pure data so the
// bare `node --test` runner can assert the ordering the renderer relies on:
// nothing heavy may run on "low", and "high" may only ever add cost over
// "balanced". The scene reads this table once at mount; it never re-derives
// effect flags inline, which is what keeps the tier contract testable.

import type { GraphicsQuality } from "../graphics.js";

export type EffectTier = {
  /** ACES tone mapping + sRGB output. Off on low so weak mobile GPUs skip the
   *  per-fragment colour transform entirely. */
  toneMapping: boolean;
  /** Sky dome: a two-colour gradient shader, or nothing but the fog colour. */
  sky: "gradient" | "solid";
  /** Animated water (time-driven shader displacement). */
  waterAnimation: boolean;
  waterAnimationSpeed: number;
  shadowMapSize: 2048 | 1024 | 512;
  /** Post-processing pass, loaded dynamically only when true. */
  bloom: boolean;
  /** Entity labels: full chip near, icon+value mid, a coloured dot far. */
  labelStyle: "chip" | "chip-compact" | "dot";
  /** Mission objective marker: a light beam, or a plain ground ring. */
  beacon: "beam" | "ring";
  /** Cap on decorative environment props (trees, rocks). Instanced, so the
   *  budget trades per-frame instance work, not draw calls. */
  propBudget: number;
  /** Props cast shadows. Low keeps the shadow pass free of the scatter. */
  propShadows: boolean;
};

export const effectTierFor = (quality: GraphicsQuality): EffectTier => quality === "high"
  ? {
    toneMapping: true,
    sky: "gradient",
    waterAnimation: true,
    waterAnimationSpeed: 1,
    shadowMapSize: 2048,
    bloom: true,
    labelStyle: "chip",
    beacon: "beam",
    propBudget: 5200,
    propShadows: true,
  }
  : quality === "balanced"
    ? {
      toneMapping: true,
      sky: "gradient",
      waterAnimation: true,
      waterAnimationSpeed: 0.6,
      shadowMapSize: 1024,
      bloom: false,
      labelStyle: "chip-compact",
      beacon: "ring",
      propBudget: 3000,
      propShadows: true,
    }
    : {
      toneMapping: false,
      sky: "solid",
      waterAnimation: false,
      waterAnimationSpeed: 0,
      shadowMapSize: 512,
      bloom: false,
      labelStyle: "dot",
      beacon: "ring",
      propBudget: 800,
      propShadows: false,
    };

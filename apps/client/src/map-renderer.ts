import type { MapRenderer } from "./map-contract.js";

export type MapRendererSetting = MapRenderer | "auto";

export type MapRendererOptions = {
  setting?: string;
  rolloutPercent?: string | number;
  playerId: string;
};

export function stableRolloutBucket(playerId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < playerId.length; index += 1) {
    hash ^= playerId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function normalizeRolloutPercent(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.floor(parsed)));
}

export function resolveMapRenderer(options: MapRendererOptions): MapRenderer {
  const setting: MapRendererSetting = options.setting === "three" || options.setting === "auto" ? options.setting : "pixi";
  if (setting !== "auto") return setting;
  return stableRolloutBucket(options.playerId) < normalizeRolloutPercent(options.rolloutPercent) ? "three" : "pixi";
}

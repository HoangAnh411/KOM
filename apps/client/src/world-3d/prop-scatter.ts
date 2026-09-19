// Where the world's decorative props go, as pure data. The renderer cannot
// afford to decide this: the bare `node --test` runner is where the contract
// lives — the forest must read as a forest (roughly every other cell has a
// tree), the plains must stay open, and the same world must always scatter the
// same props, because exploration gating re-filters this list in place rather
// than re-planning it.
//
// Placement is cell-based with sub-cell jitter so a dense forest does not
// resolve into a grid. Water is not known here — the authored GLB's coastline
// is not in the biome grid — so the renderer drops placements the heightfield
// says are over sea.

import type { WorldTerrain } from "@kingdoms/shared";

export type PropAssetKey = "roundTree" | "plainTree" | "crookedTree" | "rock" | "rockSmall";

export type PropPlacement = {
  asset: PropAssetKey;
  /** Cell coordinates (jittered, so fractional). */
  x: number;
  y: number;
  scale: number;
  /** Radians around Y. */
  rotation: number;
  /** 0–1, the renderer's per-instance colour variation seed. */
  tint: number;
};

export type ScatterOptions = {
  extent: number;
  budget: number;
  biomeAt: (x: number, y: number) => WorldTerrain;
};

const hash = (x: number, y: number): number => ((x * 73856093) ^ (y * 19349663)) >>> 0;

/** One placement decision for a cell, or none. The modulo windows are the
 *  biome densities: forest carries the map's green weight, hills carry rock,
 *  plains stay grazing-open, swamp gets the odd dead tree. */
function placementFor(x: number, y: number, biome: WorldTerrain): PropPlacement | undefined {
  const seed = hash(x, y);
  const roll = seed % 100;
  const variant = (seed >>> 8) % 100;
  const step = (seed >>> 16) % 11;
  if (biome === "forest") {
    if (roll >= 45) return undefined;
    return {
      asset: variant < 55 ? "roundTree" : variant < 85 ? "plainTree" : "crookedTree",
      x, y,
      scale: 1.6 + step * 0.1,
      rotation: (seed % 24) * Math.PI / 12,
      tint: ((seed >>> 20) % 100) / 100,
    };
  }
  if (biome === "hills") {
    if (roll < 22) {
      return {
        asset: variant < 60 ? "rock" : "rockSmall",
        x, y,
        scale: 1.2 + step * 0.1,
        rotation: (seed % 16) * Math.PI / 8,
        tint: ((seed >>> 20) % 100) / 100,
      };
    }
    if (roll < 30) {
      return {
        asset: "crookedTree",
        x, y,
        scale: 1.4 + step * 0.08,
        rotation: (seed % 24) * Math.PI / 12,
        tint: ((seed >>> 20) % 100) / 100,
      };
    }
    return undefined;
  }
  if (biome === "plains") {
    if (roll < 5) {
      return {
        asset: variant < 50 ? "plainTree" : "crookedTree",
        x, y,
        scale: 1.7 + step * 0.1,
        rotation: (seed % 24) * Math.PI / 12,
        tint: ((seed >>> 20) % 100) / 100,
      };
    }
    if (roll < 9) {
      return { asset: "rockSmall", x, y, scale: 0.9 + step * 0.05, rotation: (seed % 16) * Math.PI / 8, tint: ((seed >>> 20) % 100) / 100 };
    }
    return undefined;
  }
  // swamp: the odd crooked tree, nothing else stands in marsh.
  if (roll < 10) {
    return { asset: "crookedTree", x, y, scale: 1.4 + step * 0.08, rotation: (seed % 24) * Math.PI / 12, tint: ((seed >>> 20) % 100) / 100 };
  }
  return undefined;
}

/** Props for the whole world, capped at `budget` and thinned evenly — a
 *  row-major cap would leave the bottom of the map bare, so the overflow is
 *  strided out across the candidate list instead. */
export function scatterProps(options: ScatterOptions): PropPlacement[] {
  const { extent, budget, biomeAt } = options;
  if (budget <= 0) return [];
  const candidates: PropPlacement[] = [];
  for (let y = 0; y < extent; y += 1) for (let x = 0; x < extent; x += 1) {
    const placement = placementFor(x, y, biomeAt(x, y));
    if (placement) {
      // Jitter inside the cell from separate hash streams: the same (x, y)
      // pair must not correlate the placement with its own offset. ±0.38 of
      // the cell keeps the prop inside its own tile at every draw distance.
      placement.x += ((hash(x + extent, y) % 1000) / 1000 - 0.5) * 0.76;
      placement.y += ((hash(x, y + extent) % 1000) / 1000 - 0.5) * 0.76;
      candidates.push(placement);
    }
  }
  if (candidates.length <= budget) return candidates;
  const stride = candidates.length / budget;
  const kept: PropPlacement[] = [];
  for (let index = 0; kept.length < budget && index < candidates.length; index += stride) {
    kept.push(candidates[Math.floor(index)]!);
  }
  return kept;
}

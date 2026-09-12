import type { WorldMapFactory } from "./map-contract.js";

// Filled in by the next migration slice. Keeping this module as a separately
// loaded backend proves the rollout and fallback seam without putting Three in
// the eager authentication graph.
export const createThreeWorldMap: WorldMapFactory = () => {
  throw new Error("THREE_MAP_NOT_READY");
};

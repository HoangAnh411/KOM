// The authored terrain GLB is the only place that knows where the coastline
// is: the analytic `terrainHeight` in the scene is biome arithmetic and would
// happily stand a tree in the open sea. This module turns the terrain mesh's
// own vertex positions into a small height grid — built once at load, O(vertex
// count) — that props and roads can be grounded on and filtered against water.
//
// Pure by design: it takes a flat position array, never a three.js object, so
// the bare `node --test` runner can hold the binning and interpolation.

export type Heightfield = {
  /** Grid resolution per side. */
  size: number;
  /** `size × size` heights, `NaN` where no terrain vertex landed in the bin
   *  (open water beyond the coast). */
  heights: Float32Array;
  /** World-space (x, z) → surface height. `undefined` when every surrounding
   *  bin is empty — the caller's signal for "over water". */
  sample: (x: number, z: number) => number | undefined;
};

export type HeightfieldOptions = {
  /** Flat [x, y, z, ...] world-space vertex positions of the terrain meshes. */
  positions: Float32Array;
  /** World size the grid covers; positions are expected within ±worldSize/2. */
  worldSize: number;
  size: number;
};

export function buildHeightfield(options: HeightfieldOptions): Heightfield {
  const { positions, worldSize, size } = options;
  const heights = new Float32Array(size * size).fill(Number.NaN);
  const half = worldSize / 2;
  const binOf = (value: number): number => Math.min(size - 1, Math.max(0, Math.floor((value + half) / worldSize * size)));
  for (let index = 0; index + 2 < positions.length; index += 3) {
    const binX = binOf(positions[index]!);
    const binZ = binOf(positions[index + 2]!);
    const height = positions[index + 1]!;
    // Max, not mean: a bin shared by a cliff top and a valley floor should
    // carry the top, so a prop on the rim does not bury itself in the slope.
    const bin = binZ * size + binX;
    if (Number.isNaN(heights[bin]!) || height > heights[bin]!) heights[bin] = height;
  }
  const sample = (x: number, z: number): number | undefined => {
    const gridX = (x + half) / worldSize * size - 0.5;
    const gridZ = (z + half) / worldSize * size - 0.5;
    const left = Math.floor(gridX);
    const top = Math.floor(gridZ);
    if (left < -1 || top < -1 || left > size - 1 || top > size - 1) return undefined;
    // Bilinear over the four surrounding bins, renormalising away the NaN
    // corners so the shoreline interpolates between land and "no data" instead
    // of collapsing to NaN one bin early.
    let total = 0;
    let weight = 0;
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const binX = left + dx;
      const binZ = top + dz;
      if (binX < 0 || binZ < 0 || binX >= size || binZ >= size) continue;
      const cornerWeight = (dx === 0 ? 1 - (gridX - left) : gridX - left) * (dz === 0 ? 1 - (gridZ - top) : gridZ - top);
      const height = heights[binZ * size + binX]!;
      if (Number.isNaN(height) || cornerWeight === 0) continue;
      total += height * cornerWeight;
      weight += cornerWeight;
    }
    return weight > 0 ? total / weight : undefined;
  };
  return { size, heights, sample };
}

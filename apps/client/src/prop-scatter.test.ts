import assert from "node:assert/strict";
import test from "node:test";
import type { WorldTerrain } from "@kingdoms/shared";
import { scatterProps, type PropPlacement } from "./world-3d/prop-scatter.js";

// A synthetic world the assertions can reason about: one biome everywhere, so
// density comparisons are between biomes rather than against an authored map.
const biomeOf = (biome: WorldTerrain) => (): WorldTerrain => biome;

const count = (placements: PropPlacement[], asset: string): number =>
  placements.filter(placement => placement.asset === asset).length;

test("the same world always scatters the same props", () => {
  const options = { extent: 64, budget: 500, biomeAt: biomeOf("forest") };
  assert.deepEqual(scatterProps(options), scatterProps(options));
});

test("the budget is honoured, and the survivors stay spread over the whole map", () => {
  const placements = scatterProps({ extent: 64, budget: 50, biomeAt: biomeOf("forest") });
  assert.equal(placements.length, 50);
  // A row-major cap would clear the bottom rows; an even thinning keeps every
  // band of the map populated.
  const bands = [0, 0, 0, 0];
  for (const placement of placements) bands[Math.min(3, Math.floor(placement.y / 16))]! += 1;
  assert.ok(bands.every(count => count > 0), `a quarter of the map went bare: ${bands.join(",")}`);
});

test("forest is far denser than plains, and each biome grows what it should", () => {
  const forest = scatterProps({ extent: 64, budget: 5000, biomeAt: biomeOf("forest") });
  const plains = scatterProps({ extent: 64, budget: 5000, biomeAt: biomeOf("plains") });
  // "forest" cells are every other cell, so ~45% density lands near a quarter
  // of all cells; plains caps out at ~5% on its cells.
  assert.ok(forest.length > plains.length * 3, `forest (${forest.length}) must dwarf plains (${plains.length})`);
  const trees = count(forest, "roundTree") + count(forest, "plainTree") + count(forest, "crookedTree");
  assert.equal(trees, forest.length, "forest placements must all be trees");
  assert.ok(count(forest, "roundTree") > 0 && count(forest, "plainTree") > 0 && count(forest, "crookedTree") > 0);
  for (const placement of plains) {
    assert.ok(["plainTree", "crookedTree", "rockSmall"].includes(placement.asset), `plains grew a ${placement.asset}`);
  }
  const hills = scatterProps({ extent: 64, budget: 5000, biomeAt: biomeOf("hills") });
  for (const placement of hills) {
    assert.ok(["rock", "rockSmall", "crookedTree"].includes(placement.asset), `hills grew a ${placement.asset}`);
  }
  assert.ok(count(hills, "rock") > 0 && count(hills, "rockSmall") > 0);
  const swamp = scatterProps({ extent: 64, budget: 5000, biomeAt: biomeOf("swamp") });
  for (const placement of swamp) assert.equal(placement.asset, "crookedTree");
});

test("jitter keeps every prop inside its own cell", () => {
  for (const placement of scatterProps({ extent: 64, budget: 3000, biomeAt: biomeOf("forest") })) {
    const cellX = Math.round(placement.x);
    const cellY = Math.round(placement.y);
    assert.ok(Math.abs(placement.x - cellX) <= 0.5, `x jitter left the cell: ${placement.x}`);
    assert.ok(Math.abs(placement.y - cellY) <= 0.5, `y jitter left the cell: ${placement.y}`);
    assert.ok(cellX >= 0 && cellX < 64 && cellY >= 0 && cellY < 64);
  }
});

test("a zero budget plans nothing rather than an empty forest of one", () => {
  assert.deepEqual(scatterProps({ extent: 8, budget: 0, biomeAt: biomeOf("forest") }), []);
});

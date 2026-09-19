import assert from "node:assert/strict";
import test from "node:test";
import { buildHeightfield } from "./world-3d/heightfield.js";

// A 4×4 grid over a 4-unit world: one vertex per cell centre, height rising
// with x so interpolation has a slope to reproduce, and the last column empty
// to model open water past a coastline.
const worldSize = 4;
const size = 4;
const positions: number[] = [];
for (let z = 0; z < 4; z += 1) for (let x = 0; x < 3; x += 1) {
  positions.push(x - 1.5, x, z - 1.5); // world (x, height=x, z)
}
const field = buildHeightfield({ positions: new Float32Array(positions), worldSize, size });

test("a sample lands between its neighbours, on the slope the vertices carry", () => {
  assert.equal(field.sample(-1.5, -1.5), 0); // exactly on the x=0 vertex
  const midway = field.sample(-1, -1.5);     // halfway between x=0 and x=1
  assert.ok(midway !== undefined && Math.abs(midway - 0.5) < 0.01, `midway sample was ${midway}`);
});

test("the empty side of the coast reads as water, the shoreline does not collapse early", () => {
  assert.equal(field.sample(1.5, 0), undefined, "beyond the last land column there is no height");
  // Half a bin before the coast the nearest land still answers.
  assert.notEqual(field.sample(1.25, 0), undefined, "the shoreline folded to water a bin early");
});

test("outside the world there is nothing to stand on", () => {
  assert.equal(field.sample(-99, 0), undefined);
  assert.equal(field.sample(0, 99), undefined);
});

test("the highest vertex in a bin wins, so a rim prop does not bury itself in the valley", () => {
  const cliff = buildHeightfield({
    positions: new Float32Array([-0.5, 1, -0.5, -0.5, -5, -0.45]),
    worldSize: 4,
    size: 4,
  });
  assert.equal(cliff.sample(-0.5, -0.5), 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import { METER_RADIUS, METER_TOP_OFFSET, meterFor } from "./ui/progress-meter.js";

// The ring's contract: the dash pair is the fill percentage on a
// circumference of 100, and the arc starts at twelve o'clock. Both are
// asserted because both have silent failure modes — a wrong offset still
// draws a correct-looking arc, just from three o'clock.

test("the dash pair is the fill percentage on a 100-unit circumference", () => {
  assert.equal(meterFor(0.25).strokeDasharray, "25 75");
  assert.equal(meterFor(1).strokeDasharray, "100 0");
  assert.equal(meterFor(0).strokeDasharray, "0 100");
});

test("fractions outside 0–1 are clamped, never an over- or under-filled ring", () => {
  assert.equal(meterFor(1.5).fraction, 1);
  assert.equal(meterFor(-0.4).fraction, 0);
  assert.equal(meterFor(1.5).strokeDasharray, "100 0");
  assert.equal(meterFor(-0.4).strokeDasharray, "0 100");
});

test("the radius really is a 100-unit circumference and the arc starts at the top", () => {
  assert.ok(Math.abs(2 * Math.PI * METER_RADIUS - 100) < 0.01, "dash units are no longer percentages");
  // A quarter of the circumference, measured in the same percent units.
  assert.equal(METER_TOP_OFFSET, 25);
  assert.equal(meterFor(0.5).strokeDashoffset, 25);
});

import assert from "node:assert/strict";
import test from "node:test";
import { queueProgress } from "./queue-progress.js";

// Timestamps chosen on round numbers so the arithmetic reads at a glance: a
// 1000ms queue observed at its halfway point.

test("halfway through a queue reads as one half", () => {
  assert.equal(queueProgress("2026-01-01T00:00:00Z", "2026-01-01T00:00:01Z", Date.parse("2026-01-01T00:00:00.5Z")), 0.5);
});

test("before the start and after the deadline are clamped to the ring's ends", () => {
  const start = "2026-01-01T00:00:00Z", end = "2026-01-01T00:00:01Z";
  assert.equal(queueProgress(start, end, Date.parse("2025-12-31T23:59:59Z")), 0);
  assert.equal(queueProgress(start, end, Date.parse("2026-01-01T00:00:30Z")), 1);
});

test("a missing or unparsable start leaves the ring empty rather than lying", () => {
  assert.equal(queueProgress(undefined, "2026-01-01T00:00:01Z", Date.parse("2026-01-01T00:00:00.5Z")), 0);
  assert.equal(queueProgress("not a date", "2026-01-01T00:00:01Z", Date.now()), 0);
});

test("a zero-length or inverted queue reads as already done", () => {
  const at = "2026-01-01T00:00:00Z";
  assert.equal(queueProgress(at, at, Date.parse(at)), 1);
  assert.equal(queueProgress("2026-01-01T00:00:02Z", "2026-01-01T00:00:01Z", Date.parse(at)), 1);
});

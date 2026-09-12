import assert from "node:assert/strict";
import test from "node:test";
import { chooseRenderer } from "./world-renderer.js";

test("renderer selection prefers the dynamically loaded renderer", async () => {
  const failures: unknown[] = [];
  const result = await chooseRenderer(async () => () => "3d", () => "2d", failure => failures.push(failure));
  assert.deepEqual(result, { renderer: "3d", fallback: false });
  assert.deepEqual(failures, []);
});

test("renderer selection falls back when the dynamic import rejects", async () => {
  const failure = new Error("chunk unavailable");
  const seen: unknown[] = [];
  const result = await chooseRenderer<string>(async () => { throw failure; }, () => "2d", error => seen.push(error));
  assert.equal(result?.renderer, "2d");
  assert.equal(result?.fallback, true);
  assert.equal(result?.failure, failure);
  assert.deepEqual(seen, [failure]);
});

test("renderer selection falls back when construction throws synchronously", async () => {
  const failure = new Error("WebGL context unavailable");
  const result = await chooseRenderer(
    async () => () => { throw failure; },
    () => ({ kind: "2d" }),
    () => undefined,
  );
  assert.deepEqual(result?.renderer, { kind: "2d" });
  assert.equal(result?.failure, failure);
});

test("cancelled renderer selection creates neither preferred nor fallback renderer", async () => {
  let constructed = 0;
  let cancelled = false;
  const result = await chooseRenderer(
    async () => { cancelled = true; return () => { constructed += 1; return "3d"; }; },
    () => { constructed += 1; return "2d"; },
    () => undefined,
    () => cancelled,
  );
  assert.equal(result, undefined);
  assert.equal(constructed, 0);
});

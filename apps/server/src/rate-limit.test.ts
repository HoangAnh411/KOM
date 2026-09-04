import test from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "./rate-limit.js";

test("rate limiter rejects the command after the bucket is exhausted", async () => {
  const limiter = new RateLimiter();
  assert.equal(await limiter.consume("test", 2, 60_000), true);
  assert.equal(await limiter.consume("test", 2, 60_000), true);
  assert.equal(await limiter.consume("test", 2, 60_000), false);
});

test("each bucket key counts on its own, so a tighter limit cannot be spent by other traffic", async () => {
  const limiter = new RateLimiter();
  // A player who used up the wide write allowance still has the whole spy allowance left,
  // because the two consume different keys instead of one shared `write:<playerId>` counter.
  for (let index = 0; index < 20; index++) assert.equal(await limiter.consume("write:p1", 20, 60_000), true);
  assert.equal(await limiter.consume("write:p1", 20, 60_000), false);
  assert.equal(await limiter.consume("spy:p1", 5, 60_000), true);
  assert.equal(await limiter.consume("combat:p1", 10, 60_000), true);
  // Buckets are per player as well: exhausting p1 leaves p2 untouched.
  for (let index = 0; index < 4; index++) assert.equal(await limiter.consume("spy:p1", 5, 60_000), true);
  assert.equal(await limiter.consume("spy:p1", 5, 60_000), false);
  assert.equal(await limiter.consume("spy:p2", 5, 60_000), true);
});

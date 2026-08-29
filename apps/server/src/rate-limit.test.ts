import test from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "./rate-limit.js";

test("rate limiter rejects the command after the bucket is exhausted", async () => {
  const limiter = new RateLimiter();
  assert.equal(await limiter.consume("test", 2, 60_000), true);
  assert.equal(await limiter.consume("test", 2, 60_000), true);
  assert.equal(await limiter.consume("test", 2, 60_000), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { retryDelayMs, shouldDeadLetter, toEnvelope, MAX_RETRY_MS, type OutboxRow } from "./outbox.js";

test("retry delay is exponential from 1s to 5 minutes", () => {
  assert.equal(retryDelayMs(1), 1000);
  assert.equal(retryDelayMs(2), 2000);
  assert.equal(retryDelayMs(3), 4000);
  assert.equal(retryDelayMs(9), 256_000);
  assert.equal(retryDelayMs(10), 300_000);
  assert.equal(retryDelayMs(50), MAX_RETRY_MS);
  assert.equal(retryDelayMs(0), 1000);
});

test("dead letter triggers after 10 attempts", () => {
  assert.equal(shouldDeadLetter(0), false);
  assert.equal(shouldDeadLetter(9), false);
  assert.equal(shouldDeadLetter(10), true);
  assert.equal(shouldDeadLetter(11), true);
});

test("envelope is fixed { id, type, payload, createdAt }", () => {
  const row: OutboxRow = { id: "evt-1", eventType: "build.accepted", payload: { id: "evt-1", eventType: "build.accepted", createdAt: "2026-08-31T00:00:00.000Z", payload: { cityId: "c1" } }, attemptCount: 1 };
  assert.deepEqual(toEnvelope(row), { id: "evt-1", type: "build.accepted", payload: row.payload, createdAt: "2026-08-31T00:00:00.000Z" });
});

test("envelope falls back to now when payload lacks createdAt", () => {
  const before = Date.now();
  const envelope = toEnvelope({ id: "evt-2", eventType: "auth.registered", payload: { x: 1 }, attemptCount: 1 });
  assert.equal(envelope.id, "evt-2");
  const parsed = Date.parse(envelope.createdAt);
  assert.ok(parsed >= before && parsed <= Date.now());
});
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createClient } from "redis";
import { claimBatch, publishBatch, OUTBOX_STREAM, OUTBOX_DLQ_STREAM, type OutboxEnvelope, type StreamPublisher } from "./outbox.js";

// PostgreSQL behavior is exercised for every test. The in-memory stream makes
// failure injection deterministic; a separate case below verifies real Redis.
class FakeRedis {
  private streams = new Map<string, Array<{ entryId: string; fields: Record<string, string> }>>();
  async xAdd(stream: string, entryId: string, fields: Record<string, string>): Promise<string> {
    const entries = this.streams.get(stream) ?? [];
    entries.push({ entryId, fields });
    this.streams.set(stream, entries);
    return entryId;
  }
  async xRange(stream: string, _from: string, _to: string): Promise<Array<{ id: string; message: Record<string, string> }>> {
    return (this.streams.get(stream) ?? []).map(entry => ({ id: entry.entryId, message: entry.fields }));
  }
  async flushDb(): Promise<void> { this.streams.clear(); }
}

const databaseUrl = process.env.RUN_POSTGRES_INTEGRATION === "1" ? process.env.TEST_DATABASE_URL : undefined;
const redisUrl = process.env.TEST_REDIS_URL;
const skip = !databaseUrl;

const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 4 }) : (undefined as unknown as Pool);
const redis = new FakeRedis();

async function insertOutbox(id: string, event: string, attempt = 0, createdAt = new Date()): Promise<void> {
  const payload = { id, eventType: event, aggregateType: "test", aggregateId: "a", payload: { cmd: id }, createdAt: createdAt.toISOString() };
  await pool.query("INSERT INTO outbox_events (id, event_type, payload, attempt_count, next_attempt_at) VALUES ($1,$2,$3,$4, now())", [id, event, JSON.stringify(payload), attempt]);
}

async function streamEntries(): Promise<Array<{ id: string; event: string }>> {
  const result = await redis.xRange(OUTBOX_STREAM, "-", "+");
  return result.map(entry => {
    const parsed: OutboxEnvelope = JSON.parse(entry.message.event as string);
    return { id: parsed.id, event: parsed.type };
  });
}

// publishBatch claims whatever row is due, so a report can carry rows this file never
// inserted — the app writes outbox_events too. Assert about the row under test rather than
// about the whole batch, so a neighbouring writer cannot turn a pass into a failure.
function only(ids: string[], id: string): string[] {
  return ids.filter(entry => entry === id);
}

test.before(async () => {
  if (skip) return;
  try {
    await pool.query("TRUNCATE outbox_events");
    await redis.flushDb();
  } catch (error) { /* first run may have no tables yet */ }
});

test("publishes events with the fixed envelope then marks published_at", { skip }, async () => {
  const id = randomUUID();
  await insertOutbox(id, "build.accepted");
  const report = await publishBatch(pool, redis, 10);
  assert.deepEqual(only(report.published, id), [id]);
  const entries = await streamEntries();
  const entry = entries.find(item => item.id === id);
  assert.ok(entry, "event must be in the stream");
  assert.equal(entry.event, "build.accepted");
  const row = (await pool.query("SELECT published_at FROM outbox_events WHERE id=$1", [id])).rows[0];
  assert.ok(row.published_at, "published_at must be set after XADD");
});

test("crash between publish and update redelivers the same id (duplicate-safe by id)", { skip }, async () => {
  const id = randomUUID();
  await insertOutbox(id, "player.ban");
  const rows = await claimBatch(pool, 10);
  const claimed = rows.find(row => row.id === id)!;
  await redis.xAdd(OUTBOX_STREAM, "*", { event: JSON.stringify({ id, type: claimed.eventType, payload: claimed.payload, createdAt: (claimed.payload as any).createdAt }) });
  // simulate crash: published_at is NOT updated; lease expires so the row is claimable again
  await pool.query("UPDATE outbox_events SET claimed_at = now() - interval '61 seconds' WHERE id=$1", [id]);
  const report = await publishBatch(pool, redis, 10);
  assert.deepEqual(only(report.published, id), [id]);
  const entries = await streamEntries();
  assert.equal(entries.filter(entry => entry.id === id).length, 2, "same event id delivered twice is valid; consumers dedupe by id");
});

test("concurrent claims never double-claim a row", { skip }, async () => {
  const ids = Array.from({ length: 10 }, () => randomUUID());
  for (const id of ids) await insertOutbox(id, "tick.logistics");
  const clients = new Pool({ connectionString: databaseUrl, max: 4 });
  const results = await Promise.all(Array.from({ length: 3 }, () => claimBatch(clients, 10)));
  const claimed = results.flat().map(row => row.id);
  assert.equal(new Set(claimed).size, claimed.length, "a row must be claimed by exactly one claimant");
  const attempt = await clients.query("SELECT COALESCE(sum(attempt_count),0)::int AS total FROM outbox_events WHERE id = ANY($1::uuid[])", [ids]);
  assert.equal(attempt.rows[0].total, ids.length, "each row is claimed exactly once");
  await clients.end();
});

test("failed publishes retry with backoff, then recover", { skip }, async () => {
  const id = randomUUID();
  await insertOutbox(id, "espionage.started", 0);
  const down: StreamPublisher = {
    xAdd: async () => { throw new Error("redis down"); },
  };
  const first = await publishBatch(pool, down, 10);
  assert.deepEqual(only(first.failed, id), [id]);
  const row = (await pool.query("SELECT attempt_count, next_attempt_at, last_error FROM outbox_events WHERE id=$1", [id])).rows[0];
  assert.equal(row.attempt_count, 1);
  assert.ok(row.last_error.includes("redis down"));
  assert.ok(new Date(row.next_attempt_at).getTime() > Date.now(), "next attempt is backed off");
  await pool.query("UPDATE outbox_events SET next_attempt_at = now() WHERE id=$1", [id]);
  const second = await publishBatch(pool, redis, 10);
  assert.deepEqual(only(second.published, id), [id], "event recovers once Redis is back");
});

test("events dead-letter after 10 attempts into the DLQ stream", { skip }, async () => {
  const id = randomUUID();
  await insertOutbox(id, "world_event.spawned", 9);
  const selective: StreamPublisher = {
    xAdd: async (stream, _entry, fields) => {
      if (stream === OUTBOX_STREAM) throw new Error("primary stream down");
      return redis.xAdd(stream, "*", fields);
    },
  };
  const report = await publishBatch(pool, selective, 10);
  assert.deepEqual(only(report.deadLettered, id), [id]);
  const row = (await pool.query("SELECT attempt_count, dead_lettered_at FROM outbox_events WHERE id=$1", [id])).rows[0];
  assert.equal(row.attempt_count, 10);
  assert.ok(row.dead_lettered_at, "row must be dead-lettered after 10 attempts");
  const dlq = await redis.xRange(OUTBOX_DLQ_STREAM, "-", "+");
  assert.ok(dlq.some(entry => JSON.parse(entry.message.event as string).id === id), "envelope lands in the DLQ stream");
  const inbox = await redis.xRange(OUTBOX_STREAM, "-", "+");
  assert.ok(!inbox.some(entry => JSON.parse(entry.message.event as string).id === id));
});

test("a failed DLQ publish keeps the event retryable", { skip }, async () => {
  const id = randomUUID();
  await insertOutbox(id, "world_event.failed", 9);
  const unavailable: StreamPublisher = { xAdd: async () => { throw new Error("redis unavailable"); } };
  const report = await publishBatch(pool, unavailable, 10);
  assert.deepEqual(only(report.failed, id), [id]);
  assert.deepEqual(only(report.deadLettered, id), []);
  const row = (await pool.query("SELECT dead_lettered_at, claimed_at, next_attempt_at, last_error FROM outbox_events WHERE id=$1", [id])).rows[0];
  assert.equal(row.dead_lettered_at, null);
  assert.equal(row.claimed_at, null);
  assert.ok(new Date(row.next_attempt_at).getTime() > Date.now());
  assert.match(row.last_error, /DLQ publish failed/);
});

test("publishes an envelope to a real Redis Stream", { skip: skip || !redisUrl }, async () => {
  const id = randomUUID();
  await insertOutbox(id, "redis.integration");
  const client = createClient({ url: redisUrl });
  client.on("error", () => undefined);
  try {
    await client.connect();
    const report = await publishBatch(pool, client, 10);
    assert.deepEqual(only(report.published, id), [id]);
    const entries = await client.xRange(OUTBOX_STREAM, "-", "+");
    const entry = entries.find(item => JSON.parse(item.message.event).id === id);
    assert.ok(entry, "event must be present in the real Redis stream");
    await client.xDel(OUTBOX_STREAM, entry.id);
  } finally {
    if (client.isOpen) client.disconnect();
  }
});

test.after(async () => {
  if (skip) return;
  await pool.end();
});

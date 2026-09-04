import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { EventLedger } from "./event-ledger.js";

// A recorder instead of a database: these assertions are about the shape of the query the boot
// path sends, which is the whole point of P0.2, and they must run on the plain unit gate (the
// PostgreSQL gate needs Docker and is skipped on contributor machines).
function recordingPool(rows: Array<{ commandId: string }> = []) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const pool = { query: async (sql: string, values?: unknown[]) => { calls.push({ sql, values }); return { rows }; } } as unknown as Pool;
  return { pool, calls };
}

test("boot loads command ids only: one column, bounded, no payload", async () => {
  const { pool, calls } = recordingPool([{ commandId: "cmd-1" }, { commandId: "cmd-2" }]);
  const ledger = new EventLedger(pool, 5_000);

  await ledger.load();

  assert.equal(calls.length, 1, "one query, not one per row or per aggregate");
  const [{ sql, values }] = calls;
  assert.match(sql, /FROM event_ledger/);
  assert.match(sql, /LIMIT \$1/, "the scan must be bounded by the idempotency window");
  assert.deepEqual(values, [5_000]);
  assert.doesNotMatch(sql, /payload/, "payload JSONB holds battle reports and nothing reads it back");
  assert.doesNotMatch(sql, /event_type|aggregate_type|aggregate_id|actor_player_id/, "command_id is the only column needed");
  assert.match(sql, /WHERE command_id IS NOT NULL/, "rows without a command id can never answer hasCommand");
  assert.match(sql, /ORDER BY created_at DESC/, "newest first, so the window keeps the ids most likely to be retried");
  assert.ok(ledger.hasCommand("cmd-1") && ledger.hasCommand("cmd-2"));
});

test("load keeps events that are appended but not yet persisted", async () => {
  const { pool } = recordingPool();
  const ledger = new EventLedger(pool, 5_000);
  const pending = ledger.append({ eventType: "build.accepted", aggregateType: "build", aggregateId: "city-1", commandId: "cmd-pending", payload: { ok: true } });

  await ledger.load();

  // `persist()` writes `this.events`; if load() wiped them the command would commit its state
  // change with no ledger row and no outbox row, and nothing would report the loss.
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  await ledger.persist({ query: async (sql: string, values?: unknown[]) => { calls.push({ sql, values }); return { rows: [] }; } } as never);
  assert.equal(calls.filter(call => call.sql.startsWith("INSERT INTO event_ledger")).length, 1, "the pending event must still be there to persist");
  assert.equal(calls.find(call => call.sql.startsWith("INSERT INTO event_ledger"))?.values?.[0], pending.id);
});

test("hasCommand is a positive cache: a miss outside the window is not a claim the id is new", async () => {
  const { pool } = recordingPool([{ commandId: "inside-window" }]);
  const ledger = new EventLedger(pool, 1_000);
  await ledger.load();

  assert.equal(ledger.hasCommand("inside-window"), true);
  // `outside-window` was written by an older command (or a sibling process). The Set cannot know
  // that; the guarantee comes from `event_ledger_command_idx` plus the point query inside
  // `Store.executeCommand`'s transaction, which is exercised by the PostgreSQL gate.
  assert.equal(ledger.hasCommand("outside-window"), false);
});

test("history stays bounded by the window and discard removes the command id", () => {
  const ledger = new EventLedger(undefined, 3);
  for (const index of [1, 2, 3, 4, 5]) ledger.append({ eventType: "tick", aggregateType: "kingdom", aggregateId: "k", commandId: `cmd-${index}`, payload: {} });

  const history = ledger.all();
  assert.equal(history.length, 3, "history is trimmed to the window instead of growing all season");
  assert.deepEqual(history.map(event => event.commandId), ["cmd-3", "cmd-4", "cmd-5"], "oldest entries are dropped first");
  // Trimming history is not a dedupe decision: the ids stay claimed for the life of the process.
  assert.equal(ledger.hasCommand("cmd-1"), true);

  ledger.discard(history[2].id);
  assert.equal(ledger.hasCommand("cmd-5"), false, "a rolled-back command must be retryable with the same id");
});

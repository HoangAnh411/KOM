import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { config } from "./config.js";

export type LedgerEvent = { id: string; eventType: string; aggregateType: string; aggregateId: string; commandId?: string; actorPlayerId?: string; payload: unknown; createdAt: string };

export class EventLedger {
  private readonly events: LedgerEvent[] = [];
  private readonly history: LedgerEvent[] = [];
  private readonly commandIds = new Set<string>();
  constructor(private readonly pool?: Pool, private readonly window: number = config.idempotencyWindow) {}

  append(event: Omit<LedgerEvent, "id" | "createdAt">): LedgerEvent {
    const record = { ...event, id: randomUUID(), createdAt: new Date().toISOString() };
    this.events.push(record);
    this.history.push(record);
    // `history` only feeds `all()`, which no production code path reads; trim it to the same
    // window so a long season cannot grow it without bound.
    if (this.history.length > this.window) this.history.splice(0, this.history.length - this.window);
    if (record.commandId) this.commandIds.add(record.commandId);
    return record;
  }

  all(): LedgerEvent[] { return [...this.history]; }
  // Positive cache over the idempotency window, not the authority. A miss means "ask Postgres",
  // and `executeCommand` does exactly that inside the transaction (`SELECT 1 FROM event_ledger
  // WHERE command_id=$1`, backed by the partial unique index), so an id older than the window —
  // or one written by a sibling process — is still refused. Without a pool the Set is complete
  // for the life of the process, which is the whole dedupe story in in-memory mode.
  hasCommand(commandId: string): boolean { return this.commandIds.has(commandId); }
  discard(id: string): void {
    const event = this.history.find(item => item.id === id);
    const pendingIndex = this.events.findIndex(item => item.id === id); if (pendingIndex >= 0) this.events.splice(pendingIndex, 1);
    const historyIndex = this.history.findIndex(item => item.id === id); if (historyIndex >= 0) this.history.splice(historyIndex, 1);
    if (event?.commandId) this.commandIds.delete(event.commandId);
  }

  // Boot path only — `Store.load({ skipLedger: true })` keeps it off the command path. It used to
  // `SELECT` every column of every row the season had ever written, `payload` JSONB (battle
  // reports) included, with no WHERE and no LIMIT, and `Store.load()` ran inside the command
  // transaction: every command paid for the whole history. Nothing production reads back needed
  // more than the command ids, so that is all this asks for now: one column, newest first,
  // bounded by the idempotency window.
  //
  // It also no longer clears `this.events`. Those are appended-but-not-yet-persisted events, and
  // wiping them here was a silent data loss waiting for its first caller: today every appender
  // runs in the same `runExclusive` slot as the `save()` that flushes them, so nothing was lost,
  // but an appender added outside that slot would have dropped events with no error.
  async load(): Promise<void> {
    if (!this.pool) return;
    try {
      this.commandIds.clear();
      const result = await this.pool.query<{ commandId: string }>(`SELECT command_id AS "commandId" FROM event_ledger WHERE command_id IS NOT NULL ORDER BY created_at DESC LIMIT $1`, [this.window]);
      for (const row of result.rows) this.commandIds.add(row.commandId);
    } catch (error) { console.warn("event ledger load skipped", error instanceof Error ? error.message : error); }
  }

  async persist(client: PoolClient): Promise<void> {
    for (const event of this.events) {
      await client.query("INSERT INTO event_ledger (id, event_type, aggregate_type, aggregate_id, command_id, actor_player_id, payload, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING", [event.id, event.eventType, event.aggregateType, event.aggregateId, event.commandId ?? null, event.actorPlayerId ?? null, JSON.stringify(event.payload), event.createdAt]);
      await client.query("INSERT INTO outbox_events (id, event_type, payload) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING", [event.id, event.eventType, JSON.stringify(event)]);
    }
  }
  markPersisted(): void { this.events.length = 0;
  }
  async save(): Promise<void> {
    if (!this.pool || !this.events.length) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const event of this.events) {
        await client.query("INSERT INTO event_ledger (id, event_type, aggregate_type, aggregate_id, command_id, actor_player_id, payload, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING", [event.id, event.eventType, event.aggregateType, event.aggregateId, event.commandId ?? null, event.actorPlayerId ?? null, JSON.stringify(event.payload), event.createdAt]);
        await client.query("INSERT INTO outbox_events (id, event_type, payload) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING", [event.id, event.eventType, JSON.stringify(event)]);
      }
      await client.query("COMMIT");
      this.events.length = 0;
    } catch (error) { await client.query("ROLLBACK"); console.warn("event ledger save skipped", error instanceof Error ? error.message : error); } finally { client.release(); }
  }
}

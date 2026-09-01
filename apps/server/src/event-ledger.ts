import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export type LedgerEvent = { id: string; eventType: string; aggregateType: string; aggregateId: string; commandId?: string; actorPlayerId?: string; payload: unknown; createdAt: string };

type LoadedEvent = LedgerEvent & { commandId: string | null };

export class EventLedger {
  private readonly events: LedgerEvent[] = [];
  private readonly history: LedgerEvent[] = [];
  private readonly commandIds = new Set<string>();
  constructor(private readonly pool?: Pool) {}

  append(event: Omit<LedgerEvent, "id" | "createdAt">): LedgerEvent {
    const record = { ...event, id: randomUUID(), createdAt: new Date().toISOString() };
    this.events.push(record);
    this.history.push(record);
    if (record.commandId) this.commandIds.add(record.commandId);
    return record;
  }

  all(): LedgerEvent[] { return [...this.history]; }
  hasCommand(commandId: string): boolean { return this.commandIds.has(commandId); }
  discard(id: string): void {
    const event = this.history.find(item => item.id === id);
    const pendingIndex = this.events.findIndex(item => item.id === id); if (pendingIndex >= 0) this.events.splice(pendingIndex, 1);
    const historyIndex = this.history.findIndex(item => item.id === id); if (historyIndex >= 0) this.history.splice(historyIndex, 1);
    if (event?.commandId) this.commandIds.delete(event.commandId);
  }

  async load(): Promise<void> {
    if (!this.pool) return;
    try {
      this.events.length = 0; this.history.length = 0; this.commandIds.clear();
      const result = await this.pool.query<LoadedEvent>(`SELECT id, event_type AS "eventType", aggregate_type AS "aggregateType", aggregate_id AS "aggregateId", command_id AS "commandId", actor_player_id AS "actorPlayerId", payload, created_at AS "createdAt" FROM event_ledger ORDER BY created_at`);
      for (const event of result.rows) { this.history.push(event); if (event.commandId) this.commandIds.add(event.commandId); }
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

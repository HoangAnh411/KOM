import { config } from "./config.js";

// One dedupe registry for the command repositories. It replaces three private `Set<string>` fields
// (`CombatRepository`, `LogisticsRepository`, `OnboardingRepository`) that shared two problems: no
// bound, and `store.ts` copied every one of them **twice per command** for rollback — once before
// `pool.connect()` and again after the in-transaction `load()`.
//
// Bounded by the same *idempotency window* as `EventLedger` (`IDEMPOTENCY_WINDOW`, default 20 000),
// so there is one number to size, not two to keep in sync. Eviction is FIFO because a `Set`
// iterates in insertion order: the first key is the oldest claim.
//
// Same contract as `EventLedger.hasCommand()`: this is a **positive cache**. A miss on an id that
// was evicted is not a claim the id is new. In PostgreSQL mode the authority is the point query
// `SELECT 1 FROM event_ledger WHERE command_id=$1` inside the command transaction, backed by the
// partial unique index `event_ledger_command_idx`; in in-memory mode the window *is* the guarantee,
// which is the same trade the ledger already makes.
export class CommandRegistry {
  private readonly ids = new Set<string>();
  // Ids claimed since `begin()`, or `undefined` when no command transaction is open. Claims made
  // outside one — the tick resolving pursuit orders, a treaty auto-breaking — have nothing to roll
  // back to and are permanent, exactly as they were before this class existed.
  private journal: string[] | undefined;

  constructor(private readonly window: number = config.idempotencyWindow) {}

  has(commandId: string): boolean { return this.ids.has(commandId); }

  // `false` means "already claimed": the caller answers `already_processed` and changes nothing.
  claim(commandId: string): boolean {
    if (this.ids.has(commandId)) return false;
    this.ids.add(commandId);
    this.journal?.push(commandId);
    if (this.ids.size > this.window) for (const oldest of this.ids) { this.ids.delete(oldest); break; }
    return true;
  }

  // Transaction bracket for rollback. Opening is O(1) — an empty array — where the code this
  // replaces copied every claimed id in every repository, twice per command. `begin()` deliberately
  // discards any journal left open: transactions are serialized by `Store.runExclusive`, so a
  // leftover journal means the previous command already returned through its own catch.
  begin(): void { this.journal = []; }
  commit(): void { this.journal = undefined; }
  // Forgets exactly what this transaction claimed, so a command that threw can be retried with the
  // same `commandId` — the property `store.test.ts` calls "no ledger residue".
  rollback(): void { const journal = this.journal; this.journal = undefined; if (journal) this.forget(journal); }

  forget(commandIds: Iterable<string>): void { for (const commandId of commandIds) this.ids.delete(commandId); }
  // Season reset: last season's ids can never be replayed into this one.
  clear(): void { this.ids.clear(); this.journal = undefined; }
  get size(): number { return this.ids.size; }
}

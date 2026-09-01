// Pending game commands: the client mints the id before the HTTP send, blocks
// double-clicks on an in-flight duplicate, downgrades network/timeout failures
// to "uncertain" (kept for manual retry with the SAME id, so the server-side
// idempotency dedupe is safe), and persists them per player for reloads.

export type ClientCommand = { kind: string; label: string; path: string; body: Record<string, unknown> };
export type PendingCommand = ClientCommand & { commandId: string; status: "sending" | "uncertain"; startedAt: number };

export const pendingStorageKey = (playerId: string): string => `kingdoms-pending-${playerId}`;

const identicalCommand = (a: ClientCommand, b: ClientCommand): boolean => a.path === b.path && JSON.stringify(a.body) === JSON.stringify(b.body);

/** While an identical command is still sending, reuse its id (double-click
 * protection) and signal `dedupe` so the caller skips the duplicate HTTP call;
 * otherwise mint a fresh id and queue the send. */
export function beginPending(pending: PendingCommand[], command: ClientCommand, now: number, uuid: () => string): { pending: PendingCommand[]; commandId: string; dedupe: boolean } {
  const existing = pending.find(item => item.status === "sending" && identicalCommand(item, command));
  if (existing) return { pending, commandId: existing.commandId, dedupe: true };
  const commandId = uuid();
  return { pending: [...pending, { ...command, commandId, status: "sending", startedAt: now }], commandId, dedupe: false };
}

export function markUncertain(pending: PendingCommand[], commandId: string, now: number): PendingCommand[] {
  return pending.map(item => item.commandId === commandId && item.status === "sending" ? { ...item, status: "uncertain" as const, startedAt: now } : item);
}

/** A settled server response (accepted / already_processed / rejected) retires the entry. */
export function resolvePending(pending: PendingCommand[], commandId: string): PendingCommand[] {
  return pending.filter(item => item.commandId !== commandId);
}

export function loadPending(storage: Storage, playerId: string): PendingCommand[] {
  try {
    const raw = storage.getItem(pendingStorageKey(playerId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingCommand =>
      !!item && typeof item === "object"
      && typeof (item as PendingCommand).commandId === "string"
      && typeof (item as PendingCommand).kind === "string"
      && typeof (item as PendingCommand).label === "string"
      && typeof (item as PendingCommand).path === "string"
      && typeof (item as PendingCommand).body === "object" && (item as PendingCommand).body !== null
      && ((item as PendingCommand).status === "sending" || (item as PendingCommand).status === "uncertain"));
  } catch { return []; }
}

export function savePending(storage: Storage, playerId: string, pending: PendingCommand[]): void {
  try {
    const key = pendingStorageKey(playerId);
    if (pending.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(pending));
  } catch { /* storage unavailable (private mode); pending survives only in memory */ }
}

/** A reload can't know whether in-flight commands applied, so everything
 * persisted becomes "uncertain" — the player retries with the same id. */
export function restorePending(storage: Storage, playerId: string, now: number): PendingCommand[] {
  return loadPending(storage, playerId).map(item => ({ ...item, status: "uncertain" as const, startedAt: now }));
}
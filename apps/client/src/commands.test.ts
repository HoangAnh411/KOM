import assert from "node:assert/strict";
import test from "node:test";
import { beginPending, loadPending, markUncertain, pendingFor, pendingStorageKey, resolvePending, restorePending, savePending, type ClientCommand } from "./commands.js";

const command = (overrides: Partial<ClientCommand> = {}): ClientCommand => ({ kind: "build", label: "Xây", path: "/api/commands/build", body: { cityId: "c1", buildingId: "warehouse" }, ...overrides });
const uuid = (() => { let n = 0; return () => `id-${++n}`; })();

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: key => void map.delete(key), clear: () => map.clear(), key: index => [...map.keys()][index] ?? null, get length() { return map.size; } } as Storage;
}

test("beginPending mints an id and queues the command", () => {
  const result = beginPending([], command(), 1000, uuid);
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].status, "sending");
  assert.equal(result.pending[0].commandId, "id-1");
  assert.equal(result.pending[0].startedAt, 1000);
  assert.equal(result.dedupe, false);
});

test("beginPending reuses the id for an identical in-flight command (double-click)", () => {
  const first = beginPending([], command(), 1000, uuid);
  const second = beginPending(first.pending, command(), 1002, uuid);
  assert.equal(second.pending.length, 1, "no second entry");
  assert.equal(second.commandId, first.commandId, "same id reused");
  assert.equal(second.dedupe, true, "caller skips the duplicate HTTP send");
});

test("beginPending mints a fresh id for a different body", () => {
  const first = beginPending([], command(), 1000, uuid);
  const second = beginPending(first.pending, command({ body: { cityId: "c2", buildingId: "barracks" } }), 1002, uuid);
  assert.equal(second.pending.length, 2);
  assert.notEqual(second.commandId, first.commandId);
  assert.equal(second.dedupe, false);
});

test("beginPending mints a fresh id for an uncertain entry (retry keeps its own id via retryPending)", () => {
  const first = beginPending([], command(), 1000, uuid);
  const uncertain = markUncertain(first.pending, first.commandId, 1500);
  const reissued = beginPending(uncertain, command(), 2000, uuid);
  assert.equal(reissued.pending.length, 2, "uncertain entry stays for the Thử lại button");
  assert.notEqual(reissued.commandId, first.commandId);
  assert.equal(reissued.dedupe, false, "an uncertain entry is not an in-flight duplicate");
});

test("markUncertain only touches the matching sending entry", () => {
  const first = beginPending([], command(), 1000, uuid);
  const second = beginPending(first.pending, command({ body: { cityId: "c9" } }), 1001, uuid);
  const next = markUncertain(second.pending, first.commandId, 1500);
  assert.equal(next.find(item => item.commandId === first.commandId)?.status, "uncertain");
  assert.equal(next.find(item => item.commandId === second.commandId)?.status, "sending");
});

test("resolvePending retires the entry (accepted / already_processed / rejected)", () => {
  const first = beginPending([], command(), 1000, uuid);
  const second = beginPending(first.pending, command({ body: { cityId: "c9" } }), 1001, uuid);
  const next = resolvePending(second.pending, first.commandId);
  assert.equal(next.length, 1);
  assert.equal(next[0].commandId, second.commandId);
});

test("savePending/loadPending round-trip per player", () => {
  const storage = memoryStorage();
  const first = beginPending([], command(), 1000, uuid);
  savePending(storage, "p1", first.pending);
  const loaded = loadPending(storage, "p1");
  assert.deepEqual(loaded, first.pending);
  assert.equal(loadPending(storage, "p2").length, 0, "other player's key untouched");
});

test("savePending removes the key when nothing is pending", () => {
  const storage = memoryStorage();
  const first = beginPending([], command(), 1000, uuid);
  savePending(storage, "p1", first.pending);
  savePending(storage, "p1", []);
  assert.equal(storage.getItem(pendingStorageKey("p1")), null);
});

test("loadPending ignores corrupt JSON and malformed entries", () => {
  const storage = memoryStorage();
  storage.setItem(pendingStorageKey("p1"), "{not json");
  assert.deepEqual(loadPending(storage, "p1"), []);
  storage.setItem(pendingStorageKey("p1"), JSON.stringify([{ commandId: 42 }, null, "x"]));
  assert.deepEqual(loadPending(storage, "p1"), []);
  storage.setItem(pendingStorageKey("p1"), JSON.stringify([{ ...command(), commandId: "ok", status: "bogus", startedAt: 1 }]));
  assert.deepEqual(loadPending(storage, "p1"), []);
});

test("restorePending downgrades everything to uncertain (reload safety)", () => {
  const storage = memoryStorage();
  const first = beginPending([], command(), 1000, uuid);
  savePending(storage, "p1", first.pending);
  const restored = restorePending(storage, "p1", 9000);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].status, "uncertain");
  assert.equal(restored[0].startedAt, 9000);
  assert.equal(restored[0].commandId, first.commandId, "same id survives reload");
});

// `pendingFor` is what lets a control show its own status instead of the player
// looking for their order in a strip at the bottom of the column. Which means the
// match has to be exact: a chip on the wrong button is worse than no chip.
const pending = (kind: string, body: Record<string, unknown>, startedAt: number, status: "sending" | "uncertain" = "sending") =>
  ({ kind, label: kind, path: `/api/commands/${kind}`, body, commandId: `${kind}-${startedAt}`, status, startedAt });

test("pendingFor tells two commands of the same kind apart by their body", () => {
  const warehouse = pending("build", { cityId: "c1", buildingId: "warehouse" }, 1000);
  const barracks = pending("build", { cityId: "c1", buildingId: "barracks" }, 1100);
  const queue = [warehouse, barracks];
  // `kind` alone backs all four build buttons, so on its own it would light up the
  // whole panel for one click.
  assert.equal(pendingFor(queue, "build", { buildingId: "warehouse" })?.commandId, warehouse.commandId);
  assert.equal(pendingFor(queue, "build", { buildingId: "barracks" })?.commandId, barracks.commandId);
  assert.equal(pendingFor(queue, "build", { buildingId: "road_depot" }), undefined, "an unclicked button stays quiet");
  assert.equal(pendingFor(queue, "harvest", { buildingId: "warehouse" }), undefined, "kind still has to match");
  // Every named field has to match, not just one of them.
  assert.equal(pendingFor(queue, "build", { cityId: "c2", buildingId: "warehouse" }), undefined);
  assert.equal(pendingFor(queue, "build", { cityId: "c1", buildingId: "warehouse" })?.commandId, warehouse.commandId);
});

test("pendingFor without a match is the whole kind, and reports the status it found", () => {
  const queue = [pending("caravan", { caravanId: "cv1" }, 1000, "uncertain")];
  assert.equal(pendingFor(queue, "caravan")?.status, "uncertain", "the caller renders uncertain + Thử lại");
  assert.equal(pendingFor(queue, "caravan", { caravanId: "cv1" })?.status, "uncertain");
  assert.equal(pendingFor([], "caravan"), undefined);
});

test("pendingFor prefers the newest entry for a control", () => {
  // A timeout leaves an uncertain entry behind; clicking the same control again is
  // the more current truth, and when it settles the older one surfaces for retry.
  const stale = pending("escort", { caravanId: "cv1" }, 1000, "uncertain");
  const fresh = pending("escort", { caravanId: "cv1" }, 5000);
  assert.equal(pendingFor([stale, fresh], "escort", { caravanId: "cv1" })?.status, "sending");
  assert.equal(pendingFor([fresh, stale], "escort", { caravanId: "cv1" })?.status, "sending", "order in the array must not decide it");
  assert.equal(pendingFor(resolvePending([stale, fresh], fresh.commandId), "escort", { caravanId: "cv1" })?.status, "uncertain");
});
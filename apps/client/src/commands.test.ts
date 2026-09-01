import assert from "node:assert/strict";
import test from "node:test";
import { beginPending, loadPending, markUncertain, pendingStorageKey, resolvePending, restorePending, savePending, type ClientCommand } from "./commands.js";

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
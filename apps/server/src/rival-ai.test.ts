import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";
import { RivalEngine } from "./rival-ai.js";

function prepared() { const store = new GameStore(); store.snapshot.armies = store.snapshot.armies.filter(army => army.npcKind !== "rival"); store.snapshot.rivalIntents = []; return store; }

test("rival intent is deterministic and telegraphed before movement", () => {
  const a = prepared(); const b = prepared();
  const engineA = new RivalEngine(); const engineB = new RivalEngine();
  b.snapshot.season.id = a.snapshot.season.id;
  engineA.seed(a.snapshot, 1_000); engineB.seed(b.snapshot, 1_000);
  const rivalA = a.snapshot.armies.find(army => army.npcKind === "rival")!; const rivalB = b.snapshot.armies.find(army => army.npcKind === "rival")!;
  rivalB.id = rivalA.id; rivalB.x = rivalA.x; rivalB.y = rivalA.y; rivalB.nextActionAt = rivalA.nextActionAt;
  engineA.tick(a.snapshot, 2_000); engineB.tick(b.snapshot, 2_000);
  assert.deepEqual({ ...a.snapshot.rivalIntents[0], armyId: "same" }, { ...b.snapshot.rivalIntents[0], armyId: "same" });
  const before = { x: rivalA.x, y: rivalA.y };
  engineA.tick(a.snapshot, Date.parse(a.snapshot.rivalIntents[0]!.actsAt) - 1);
  assert.deepEqual({ x: rivalA.x, y: rivalA.y }, before, "intent gives a reaction window");
  engineA.tick(a.snapshot, Date.parse(a.snapshot.rivalIntents[0]!.actsAt));
  assert.notDeepEqual({ x: rivalA.x, y: rivalA.y }, before);
});

test("low-supply rival announces withdrawal", () => {
  const store = prepared(); const engine = new RivalEngine(); engine.seed(store.snapshot, 0);
  const rival = store.snapshot.armies.find(army => army.npcKind === "rival")!; rival.supply = 20;
  engine.tick(store.snapshot, 1_000);
  assert.equal(store.snapshot.rivalIntents[0]?.goal, "withdraw");
});

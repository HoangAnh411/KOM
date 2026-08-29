import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";
import { overallScore } from "@kingdoms/shared";

test("season finalization snapshots rankings and creates legacy records", () => {
  const store = new GameStore();
  store.snapshot.season.endsAt = new Date(0).toISOString();
  store.snapshot.scores[store.snapshot.players[0].id] = { military: 0, economy: 500, diplomacy: 0, overall: overallScore({ military: 0, economy: 500, diplomacy: 0 }) };
  assert.equal(store.finalizeIfDue(), true);
  assert.equal(store.snapshot.seasonHistory.length, 1);
  assert.equal(store.snapshot.legacyRecords.length, store.snapshot.players.length);
  assert.equal(store.snapshot.season.status, "ACTIVE");
});

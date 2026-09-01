import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";
import { overallScore } from "@kingdoms/shared";

test("season finalization snapshots rankings and creates legacy records", async () => {
  const store = new GameStore();
  store.snapshot.season.endsAt = new Date(0).toISOString();
  store.snapshot.scores[store.snapshot.players[0].id] = { military: 0, economy: 500, diplomacy: 0, overall: overallScore({ military: 0, economy: 500, diplomacy: 0 }) };
  assert.equal(await store.finalizeIfDue(), true);
  assert.equal(store.snapshot.seasonHistory.length, 1);
  assert.equal(store.snapshot.legacyRecords.length, store.snapshot.players.length * 3);
  assert.equal(store.snapshot.season.status, "ACTIVE");
  assert.equal(store.snapshot.armies.length, 0);
  assert.deepEqual(store.snapshot.cities[0].resources, { food: 0, wood: 500, stone: 500, iron: 500 });
  assert.deepEqual(store.snapshot.cities[0].buildings, { town_hall: 1 });
  assert.equal(await store.finalizeIfDue(), false);
});

test("hard reset keeps alliance identity and grants cosmetic reputation only", async () => { const store = new GameStore(); const player = store.snapshot.players[0]; store.diplomacy.createAlliance("create-reset", "Legacy", "LEG", player.id, store.snapshot); store.snapshot.alliances[0].members[0].contribution = 999; store.diplomacy.getStats(player.id, store.snapshot).reputation = 220; store.snapshot.season.endsAt = new Date(0).toISOString(); await store.finalizeIfDue(); assert.equal(store.snapshot.alliances[0].name, "Legacy"); assert.equal(store.snapshot.alliances[0].members[0].contribution, 0); assert.equal(player.crossSeasonReputation, 110); assert.equal(store.archiveForPlayer(player.id).profile.badge, "bronze"); });

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
  assert.equal(store.snapshot.armies.length, 2);
  assert.deepEqual(store.snapshot.cities[0].resources, { food: 0, wood: 500, stone: 500, iron: 500 });
  assert.equal(store.snapshot.cities[0].buildings.town_hall, 1);
  assert.equal(await store.finalizeIfDue(), false);
});

test("hard reset keeps alliance identity and grants cosmetic reputation only", async () => { const store = new GameStore(); const player = store.snapshot.players[0]; store.diplomacy.createAlliance("create-reset", "Legacy", "LEG", player.id, store.snapshot); store.snapshot.alliances[0].members[0].contribution = 999; store.diplomacy.getStats(player.id, store.snapshot).reputation = 220; store.snapshot.season.endsAt = new Date(0).toISOString(); await store.finalizeIfDue(); assert.equal(store.snapshot.alliances[0].name, "Legacy"); assert.equal(store.snapshot.alliances[0].members[0].contribution, 0); assert.equal(player.crossSeasonReputation, 110); assert.equal(store.archiveForPlayer(player.id).profile.badge, "bronze"); });

test("season reset preserves long-term city, army, commander and progression state", async () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  const commander = store.snapshot.commanders.find(item => item.id === army.commanderId)!;
  city.buildings.warehouse = 2;
  city.resources.food = 321;
  army.x += 1;
  army.wounded = { shield_infantry: 4, spearmen: 0, archers: 0, cavalry: 0 };
  commander.level = 4;
  commander.xp = 12;
  store.snapshot.technologyProgress[player.id] = { playerId: player.id, unlocked: ["crop_rotation"] };
  store.snapshot.campaignProgress[player.id] = { playerId: player.id, completedMissionIds: ["chapter-1-ruins"], claimedFirstClearIds: ["chapter-1-ruins"], unlockedChapter: 1 };
  store.snapshot.season.endsAt = new Date(0).toISOString();

  await store.finalizeIfDue();

  assert.equal(store.snapshot.cities.find(item => item.id === city.id)!.buildings.warehouse, 2);
  assert.equal(store.snapshot.cities.find(item => item.id === city.id)!.resources.food, 321);
  assert.equal(store.snapshot.armies.find(item => item.id === army.id)!.x, city.x + 1);
  assert.equal(store.snapshot.armies.find(item => item.id === army.id)!.wounded?.shield_infantry, 4);
  assert.equal(store.snapshot.commanders.find(item => item.id === commander.id)!.level, 4);
  assert.deepEqual(store.snapshot.technologyProgress[player.id]!.unlocked, ["crop_rotation"]);
  assert.deepEqual(store.snapshot.campaignProgress[player.id]!.completedMissionIds, ["chapter-1-ruins"]);
});

test("season transition keeps caravans, cargo and trade routes moving", async () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  city.buildings.road_depot = 1;
  city.resources.wood = 500;
  store.logistics.syncDepots(store.snapshot);
  const hub = store.logistics.snapshot().marketHubs[0]!;
  const route = store.logistics.createRoute("season-route-1", city.id, { kind: "market", id: hub.id }, player.id, store.snapshot);
  store.logistics.startCaravan("season-caravan-1", route.id, { food: 0, wood: 100, stone: 0, iron: 0 }, player.id, store.snapshot);
  assert.equal(city.resources.wood, 400, "the cargo left the city when the caravan departed");
  store.snapshot.season.endsAt = new Date(0).toISOString();

  await store.finalizeIfDue();

  assert.ok(store.logistics.snapshot().tradeRoutes.some(item => item.id === route.id), "the trade route survives the reset");
  const caravan = store.logistics.caravans().find(item => item.routeId === route.id);
  assert.ok(caravan, "the caravan is not deleted by the season transition");
  assert.equal(caravan!.status, "moving");
  assert.equal(caravan!.cargo!.wood, 100, "cargo in transit is not lost");
});

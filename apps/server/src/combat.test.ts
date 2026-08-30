import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";

test("recruit creates an army if barracks present and deducts resources", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const city = store.snapshot.cities.find(c => c.playerId === player.id)!;
  city.buildings.barracks = 1;
  city.resources = { wood: 500, stone: 500, iron: 500, food: 0 };
  
  const army = store.combat.recruit("rec-1", city.id, "infantry", 10, player.id, store.snapshot);
  assert.equal(army.unitType, "infantry");
  assert.equal(army.strength, 10);
  assert.equal(store.snapshot.armies.find(a => a.id === army.id), army);
  assert.equal(city.resources.wood, 450); // 500 - 50
  assert.equal(city.resources.stone, 470); // 500 - 30
});

test("move army updates target and ticks process movement", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const army = store.snapshot.armies.find(a => a.ownerPlayerId === player.id)!;
  
  const startX = army.x;
  const destX = startX + 2;
  store.combat.moveArmy("mov-1", army.id, destX, army.y, player.id, store.snapshot);
  assert.equal(army.targetX, destX);
  
  store.tick();
  assert.equal(army.x, startX + 1); // infantry moves 1 step per tick
  store.tick();
  assert.equal(army.x, destX); // arrived
  assert.equal(army.targetX, undefined); // target cleared after arrival
});

test("merge armies combines strength and removes source", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  
  // Fake another army on same tile
  const army1 = store.snapshot.armies.find(a => a.ownerPlayerId === player.id)!;
  const army2 = { ...army1, id: "fake-2", strength: 50 };
  store.snapshot.armies.push(army2);
  
  store.combat.mergeArmies("merge-1", army2.id, army1.id, player.id, store.snapshot);
  
  assert.equal(army1.strength, 150);
  assert.equal(store.snapshot.armies.find(a => a.id === army2.id), undefined);
});

test("attack resolves battle and updates military stats", () => {
  const store = new GameStore();
  const player1 = store.snapshot.players[0];
  const player2 = store.snapshot.players[1];
  
  const army1 = store.snapshot.armies.find(a => a.ownerPlayerId === player1.id)!;
  const army2 = store.snapshot.armies.find(a => a.ownerPlayerId === player2.id)!;
  
  // Force them to same tile
  army2.x = army1.x;
  army2.y = army1.y;
  
  // Make army1 much stronger to ensure victory
  army1.strength = 500;
  army1.unitType = "infantry";
  army2.strength = 100;
  army2.unitType = "archer"; // infantry counters archer
  
  const report = store.combat.attack("att-1", army1.id, army2.id, player1.id, store.snapshot);
  
  assert.equal(report.victor, "attacker");
  assert.ok(report.attacker.strengthAfter > 0);
  assert.equal(report.defender.strengthAfter, 0);
  
  // Check that destroyed army was removed
  assert.equal(store.snapshot.armies.find(a => a.id === army2.id), undefined);
  
  // Check stats update
  const stats1 = store.snapshot.militaryThroughput[player1.id];
  assert.equal(stats1.victories, 1);
  assert.equal(stats1.strengthDestroyed, 100);
});

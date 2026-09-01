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
  
  const result = store.combat.attack("att-1", army1.id, army2.id, player1.id, store.snapshot);
  assert.ok("victor" in result, "same-tile attack resolves immediately");
  const report = result;

  assert.equal(report.victor, "attacker");
  assert.ok(report.attacker.strengthAfter > 0);
  assert.equal(report.defender.strengthAfter, 0);

  // Check that destroyed army was removed
  assert.equal(store.snapshot.armies.find(a => a.id === army2.id), undefined);

  // Immediate resolutions are delivered by the command layer, not the tick loop
  assert.equal(store.combat.drainReports().length, 0);

  // Check stats update
  const stats1 = store.snapshot.militaryThroughput[player1.id];
  assert.equal(stats1.victories, 1);
  assert.equal(stats1.strengthDestroyed, 100);
});

test("attack on a different tile starts a pursuit order that cancel-army-order clears", () => {
  const store = new GameStore();
  const player1 = store.snapshot.players[0];
  const player2 = store.snapshot.players[1];
  const army1 = store.snapshot.armies.find(a => a.ownerPlayerId === player1.id)!;
  const army2 = store.snapshot.armies.find(a => a.ownerPlayerId === player2.id)!;
  army1.x = 2; army1.y = 2;
  army2.x = 6; army2.y = 6;

  const result = store.combat.attack("purs-1", army1.id, army2.id, player1.id, store.snapshot);
  assert.ok("pursuit" in result, "different-tile attack defers resolution");
  assert.equal(result.pursuit.id, "purs-1");
  assert.equal(result.pursuit.targetX, 6);
  assert.equal(result.pursuit.targetY, 6);
  assert.equal(army1.attackOrder?.seed, result.pursuit.seed);
  assert.equal(army1.targetX, 6);
  assert.equal(store.snapshot.battleReports.length, 0, "no battle resolved yet");

  assert.throws(() => store.combat.attack("purs-2", army1.id, army2.id, player2.id, store.snapshot), /ARMY_ACCESS_DENIED/);
  store.combat.moveArmy("mov-9", army1.id, 9, 9, player1.id, store.snapshot);
  assert.equal(army1.attackOrder, undefined, "manual move replaces the pursuit order");
});

test("pursuit chases the moving target and resolves on the same tile with the original seed", () => {
  const store = new GameStore();
  const player1 = store.snapshot.players[0];
  const player2 = store.snapshot.players[1];
  // Shield the chase from raider interference
  for (const raider of store.snapshot.armies.filter(a => a.npcKind === "raider")) raider.nextActionAt = new Date(Date.now() + 3600_000).toISOString();
  const army1 = store.snapshot.armies.find(a => a.ownerPlayerId === player1.id)!;
  const army2 = store.snapshot.armies.find(a => a.ownerPlayerId === player2.id)!;
  army1.x = 1; army1.y = 1; army1.unitType = "cavalry"; army1.strength = 300;
  army2.x = 6; army2.y = 6; army2.strength = 100;
  army1.lastSupplyAt = new Date().toISOString();
  army2.lastSupplyAt = new Date().toISOString();

  const order = (store.combat.attack("purs-3", army1.id, army2.id, player1.id, store.snapshot) as { pursuit: NonNullable<typeof army1.attackOrder> }).pursuit;
  const originalSeed = order.seed;
  assert.equal(army1.attackOrder?.id, "purs-3");

  // Target flees; the order follows its position live (updated at every tick).
  store.combat.moveArmy("mov-8", army2.id, 8, 9, player2.id, store.snapshot);
  let resolved = false;
  let report;
  for (let index = 0; index < 30 && !resolved; index++) {
    store.tick();
    report = store.snapshot.battleReports.find(item => item.attacker.armyId === army1.id && item.defender.armyId === army2.id);
    resolved = Boolean(report);
  }
  assert.ok(report, "pursuit battle resolved within 30 ticks");
  assert.equal(report.seed, originalSeed, "resolution reuses the order's original seed");
  assert.equal(army1.attackOrder, undefined, "order cleared after resolution");
  assert.equal(army1.x, army2.x, "resolved on the same tile");
  assert.equal(army1.y, army2.y);
});

test("cancel-army-order validates ownership and clears the pursuit", () => {
  const store = new GameStore();
  const player1 = store.snapshot.players[0];
  const player2 = store.snapshot.players[1];
  const army1 = store.snapshot.armies.find(a => a.ownerPlayerId === player1.id)!;
  const army2 = store.snapshot.armies.find(a => a.ownerPlayerId === player2.id)!;
  army1.x = 2; army2.x = 6; army2.y = 6;

  assert.throws(() => store.combat.cancelArmyOrder("can-1", army1.id, player1.id, store.snapshot), /NO_ATTACK_ORDER/);
  store.combat.attack("purs-4", army1.id, army2.id, player1.id, store.snapshot);
  assert.throws(() => store.combat.cancelArmyOrder("can-2", army1.id, player2.id, store.snapshot), /ARMY_ACCESS_DENIED/);
  assert.equal(store.combat.cancelArmyOrder("can-3", army1.id, player1.id, store.snapshot), "accepted");
  assert.equal(army1.attackOrder, undefined);
  assert.equal(army1.targetX, undefined);
});

test("cancel-army-order also cancels a manual move order", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const army = store.snapshot.armies.find(a => a.ownerPlayerId === player.id)!;
  assert.equal(store.combat.moveArmy("move-1", army.id, 3, 4, player.id, store.snapshot), "accepted");
  assert.equal(army.targetX, 3);
  assert.equal(army.targetY, 4);
  assert.equal(store.combat.cancelArmyOrder("can-move-1", army.id, player.id, store.snapshot), "accepted");
  assert.equal(army.attackOrder, undefined);
  assert.equal(army.targetX, undefined, "manual move canceled");
  assert.equal(army.targetY, undefined, "manual move canceled");
  // A canceled move is not re-cancelable (no active order remains).
  assert.throws(() => store.combat.cancelArmyOrder("can-move-2", army.id, player.id, store.snapshot), /NO_ATTACK_ORDER/);
});

test("a frozen or destroyed target auto-cancels the pursuit with a reason", () => {
  const store = new GameStore();
  const player1 = store.snapshot.players[0];
  const player2 = store.snapshot.players[1];
  const army1 = store.snapshot.armies.find(a => a.ownerPlayerId === player1.id)!;
  const army2 = store.snapshot.armies.find(a => a.ownerPlayerId === player2.id)!;
  army1.x = 2; army2.x = 6; army2.y = 6;
  army1.lastSupplyAt = new Date().toISOString();
  army2.lastSupplyAt = new Date().toISOString();
  store.combat.attack("purs-5", army1.id, army2.id, player1.id, store.snapshot);

  store.setPlayerStatus(player2.id, "banned", new Date().toISOString());
  store.tick();
  assert.equal(army1.attackOrder, undefined, "frozen target cancels the pursuit");
  let cancellations = store.takeTickCancellations();
  assert.deepEqual(cancellations.map(c => c.reason), ["target_frozen"]);
  assert.equal(cancellations[0].armyId, army1.id);
  assert.ok(store.ledger.all().some(event => event.eventType === "attack_order.canceled" && (event.payload as { reason: string }).reason === "target_frozen"), "auto-cancel recorded in the ledger");

  // Destroyed target
  store.setPlayerStatus(player2.id, "active");
  store.combat.attack("purs-6", army1.id, army2.id, player1.id, store.snapshot);
  store.snapshot.armies = store.snapshot.armies.filter(a => a.id !== army2.id);
  store.tick();
  assert.equal(army1.attackOrder, undefined, "vanished target cancels the pursuit");
  cancellations = store.takeTickCancellations();
  assert.deepEqual(cancellations.map(c => c.reason), ["target_destroyed"]);
});

test("a banned attacker pauses the pursuit and resumes after unban", () => {
  const store = new GameStore();
  const player1 = store.snapshot.players[0];
  const player2 = store.snapshot.players[1];
  for (const raider of store.snapshot.armies.filter(a => a.npcKind === "raider")) raider.nextActionAt = new Date(Date.now() + 3600_000).toISOString();
  const army1 = store.snapshot.armies.find(a => a.ownerPlayerId === player1.id)!;
  const army2 = store.snapshot.armies.find(a => a.ownerPlayerId === player2.id)!;
  army1.x = 1; army1.y = 1; army2.x = 6; army2.y = 6;
  army1.lastSupplyAt = new Date().toISOString();
  army2.lastSupplyAt = new Date().toISOString();
  store.combat.attack("purs-7", army1.id, army2.id, player1.id, store.snapshot);

  store.setPlayerStatus(player1.id, "banned", new Date().toISOString());
  store.tick(); store.tick(); store.tick();
  assert.equal(army1.x, 1, "banned attacker does not move");
  assert.ok(army1.attackOrder, "pursuit order survives the ban");

  store.setPlayerStatus(player1.id, "active");
  let resolved = false;
  for (let index = 0; index < 20 && !resolved; index++) { store.tick(); resolved = store.snapshot.battleReports.some(report => report.attacker.armyId === army1.id && report.defender.armyId === army2.id); }
  assert.ok(resolved, "pursuit resumes after unban");
});

test("a treaty is re-checked when the pursuit actually resolves", () => {
  const store = new GameStore();
  const player1 = store.snapshot.players[0];
  const player2 = store.snapshot.players[1];
  for (const raider of store.snapshot.armies.filter(a => a.npcKind === "raider")) raider.nextActionAt = new Date(Date.now() + 3600_000).toISOString();
  const army1 = store.snapshot.armies.find(a => a.ownerPlayerId === player1.id)!;
  const army2 = store.snapshot.armies.find(a => a.ownerPlayerId === player2.id)!;
  army1.x = 1; army1.y = 1; army1.strength = 300; army2.x = 6; army2.y = 6;
  army1.lastSupplyAt = new Date().toISOString();
  army2.lastSupplyAt = new Date().toISOString();

  assert.equal(store.diplomacy.proposeTreaty("tr-1", player2.id, "non_aggression", 3600, player1.id, store.snapshot), "accepted");
  const treaty = store.snapshot.treaties[0];
  assert.equal(store.diplomacy.respondTreaty("tr-2", treaty.id, true, player2.id, store.snapshot), "accepted");
  assert.equal(treaty.status, "active");

  store.combat.attack("purs-8", army1.id, army2.id, player1.id, store.snapshot);
  assert.equal(treaty.status, "active", "order issue does not break the treaty");
  let resolved = false;
  for (let index = 0; index < 20 && !resolved; index++) { store.tick(); resolved = store.snapshot.battleReports.some(report => report.attacker.armyId === army1.id && report.defender.armyId === army2.id); }
  assert.ok(resolved, "pursuit battle happened");
  assert.equal(treaty.status, "violated", "treaty broken at actual combat time");
  assert.ok(store.ledger.all().some(event => event.eventType === "combat.resolved" && (event.payload as { attackerArmyId: string }).attackerArmyId === army1.id), "tick-resolved player battle recorded in the ledger");
  assert.ok(store.snapshot.processedCommands.includes("purs-8-violate"), "treaty break recorded with the resolution");
});

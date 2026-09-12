import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";

test("one commander cannot be assigned to two armies", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  const other = { ...army, id: "second-army", commanderId: undefined };
  store.snapshot.armies.push(other);
  const commander = store.snapshot.commanders.find(item => item.ownerPlayerId === player.id)!;

  assert.throws(() => store.armyManagement.assignCommander("commander-assign-1", other.id, commander.id, player.id, store.snapshot), /COMMANDER_ALREADY_ASSIGNED/);
  assert.equal(army.commanderId, commander.id);
  assert.equal(other.commanderId, undefined);
});

test("composition updates are capacity checked and reconcile the reserve", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  const reserve = store.snapshot.troopReserves[army.homeCityId!]!;
  reserve.available.archers = 20;

  store.armyManagement.updateComposition("composition-update-1", army.id, {
    frontline: { id: "front", troopType: "shield_infantry", position: "frontline", count: 70 },
    backline: { id: "back", troopType: "archers", position: "backline", count: 20 },
    flank: null,
  }, "balanced", player.id, store.snapshot);

  assert.equal(army.strength, 90);
  assert.equal(reserve.available.shield_infantry, 30);
  assert.equal(reserve.available.archers, 0);
  assert.throws(() => store.armyManagement.updateComposition("composition-update-2", army.id, {
    frontline: { id: "front-2", troopType: "shield_infantry", position: "frontline", count: 101 },
    backline: null,
    flank: null,
  }, "balanced", player.id, store.snapshot), /INSUFFICIENT_RESERVE|ARMY_CAPACITY_EXCEEDED/);
});

test("composition changes are rejected while an army has an order", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  army.targetX = army.x + 1;
  assert.throws(() => store.armyManagement.updateComposition("composition-transit-1", army.id, {
    frontline: { id: "front", troopType: "shield_infantry", position: "frontline", count: 50 },
    backline: null,
    flank: null,
  }, "balanced", player.id, store.snapshot), /ARMY_IN_TRANSIT/);
});

test("applying a preset uses available troops and reports shortages", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  const preset = store.armyManagement.savePreset("preset-save-1", "Archer screen", {
    frontline: { id: "preset-front", troopType: "shield_infantry", position: "frontline", count: 50 },
    backline: { id: "preset-back", troopType: "archers", position: "backline", count: 200 },
    flank: null,
  }, "raid", player.id, store.snapshot);

  const result = store.armyManagement.applyPreset("preset-apply-1", army.id, preset.id, player.id, store.snapshot);
  assert.equal(result.missing.archers, 200);
  assert.equal(army.composition?.frontline?.count, 50);
  assert.equal(army.composition?.backline, null);
  assert.equal(army.stance, "raid");
});

test("a preset reusing one troop type across positions draws each squad from what is left", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  const reserve = store.snapshot.troopReserves[army.homeCityId!]!;
  army.composition = { frontline: { id: "sixty-front", troopType: "shield_infantry", position: "frontline", count: 60 }, backline: null, flank: null };
  army.strength = 60;
  const preset = store.armyManagement.savePreset("preset-save-dup", "Double line", {
    frontline: { id: "dup-front", troopType: "shield_infantry", position: "frontline", count: 40 },
    backline: { id: "dup-back", troopType: "shield_infantry", position: "backline", count: 40 },
    flank: null,
  }, "balanced", player.id, store.snapshot);

  const result = store.armyManagement.applyPreset("preset-apply-dup", army.id, preset.id, player.id, store.snapshot);

  assert.equal(result.missing.shield_infantry, 20, "the shortage is reported");
  assert.equal(army.composition?.frontline?.count, 40);
  assert.equal(army.composition?.backline?.count, 20, "the later position gets the remainder, not the full request again");
  assert.equal(army.strength, 60);
  assert.equal(reserve.available.shield_infantry, 0, "the reserve never goes negative");
});

test("changing commanders respects the incoming commander's capacity", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  // A veteran leads 500 troops; a fresh level-1 commander (capacity 100) cannot take over.
  store.snapshot.commanders.find(item => item.id === army.commanderId)!.level = 10;
  army.composition = { frontline: { id: "vet-front", troopType: "shield_infantry", position: "frontline", count: 500 }, backline: null, flank: null };
  army.strength = 500;
  store.snapshot.commanders.push({ id: "rookie-commander", ownerPlayerId: player.id, name: "Rookie", specialty: "infantry", level: 1, xp: 0 });

  assert.throws(() => store.armyManagement.assignCommander("commander-capacity-1", army.id, "rookie-commander", player.id, store.snapshot), /ARMY_CAPACITY_EXCEEDED/);
  assert.equal(army.commanderId !== "rookie-commander", true, "the swap is refused before any state changes");
});

test("a commander is released once the recovery timer passes after their army is destroyed at home", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  const commander = store.snapshot.commanders.find(item => item.id === army.commanderId)!;
  const city = store.snapshot.cities.find(item => item.id === army.homeCityId)!;
  // Destroyed by an NPC and sent home; it arrives before the 120s recovery ends.
  army.strength = 0;
  army.recoveryAt = new Date(Date.now() + 60_000).toISOString();
  army.returningHome = true;
  army.x = city.x;
  army.y = city.y;

  store.armyManagement.tick(store.snapshot, Date.now());
  assert.equal(army.returningHome, false, "the army arrived home");
  assert.equal(commander.assignedArmyId, army.id, "still assigned while recovering");

  store.armyManagement.tick(store.snapshot, Date.now() + 120_000);
  assert.equal(store.snapshot.armies.some(item => item.id === army.id), false, "the husk is removed once recovery expires");
  assert.equal(commander.assignedArmyId, undefined, "the commander is reusable");
});

test("recruiting reserve goes through the training queue and creating an army is a separate transaction", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  city.buildings.barracks = 1;
  city.resources = { food: 500, wood: 500, stone: 500, iron: 500 };
  const commander = store.snapshot.commanders.find(item => item.ownerPlayerId === player.id)!;
  const starter = store.snapshot.armies.find(item => item.commanderId === commander.id);
  if (starter) starter.commanderId = undefined;
  commander.assignedArmyId = undefined;
  store.armyManagement.recruitReserve("reserve-recruit-1", city.id, "spearmen", 20, player.id, store.snapshot);
  // No instant grant: the troops sit in the training queue until it completes.
  assert.equal(store.snapshot.troopReserves[city.id]!.available.spearmen, 0, "recruit-reserve must not bypass the training queue");
  assert.equal(store.snapshot.trainingQueues[city.id]!.items.length, 1);
  assert.throws(() => store.armyManagement.recruitReserve("reserve-recruit-2", city.id, "spearmen", 10, player.id, store.snapshot), /TRAINING_QUEUE_FULL/);
  store.armyManagement.tick(store.snapshot, Date.now() + 60_000);
  assert.equal(store.snapshot.troopReserves[city.id]!.available.spearmen, 20);
  const army = store.armyManagement.createArmy("army-create-1", city.id, commander.id, {
    frontline: { id: "new-front", troopType: "spearmen", position: "frontline", count: 20 },
    backline: null,
    flank: null,
  }, "balanced", player.id, store.snapshot);
  assert.equal(army.strength, 20);
  assert.equal(store.snapshot.troopReserves[city.id]!.available.spearmen, 0);
  assert.equal(commander.assignedArmyId, army.id);
});

test("transfer moves an exact squad amount without changing the reserve", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const source = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  const commander = store.snapshot.commanders.find(item => item.ownerPlayerId === player.id)!;
  commander.assignedArmyId = undefined;
  source.commanderId = undefined;
  source.composition = { frontline: { id: "source-front", troopType: "shield_infantry", position: "frontline", count: 40 }, backline: null, flank: null };
  source.strength = 40;
  const target = structuredClone(source);
  target.id = "target-army";
  target.commanderId = commander.id;
  target.composition = { frontline: { id: "target-front", troopType: "shield_infantry", position: "frontline", count: 10 }, backline: null, flank: null };
  target.strength = 10;
  store.snapshot.armies.push(target);
  commander.assignedArmyId = target.id;
  store.armyManagement.transfer("army-transfer-1", source.id, target.id, "shield_infantry", 15, "frontline", "frontline", player.id, store.snapshot);
  assert.equal(source.composition!.frontline!.count, 25);
  assert.equal(target.composition!.frontline!.count, 25);
  assert.equal(source.strength + target.strength, 50);
});

test("hospital consumes food, waits in a queue, and returns wounded to reserve", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  city.buildings.hospital = 1;
  city.resources.food = 100;
  const reserve = store.snapshot.troopReserves[city.id]!;
  reserve.wounded.archers = 20;
  store.armyManagement.heal("hospital-heal-1", city.id, "archers", 10, player.id, store.snapshot);
  assert.equal(reserve.wounded.archers, 10);
  assert.equal(city.resources.food, 90);
  store.snapshot.hospitalQueues[city.id]!.items[0]!.completesAt = new Date(0).toISOString();
  store.armyManagement.tick(store.snapshot, Date.now());
  assert.equal(reserve.available.archers, 10);
  assert.equal(store.snapshot.hospitalQueues[city.id]!.items.length, 0);
});

test("city production catches up while away and respects warehouse capacity", () => {
  const store = new GameStore();
  const city = store.snapshot.cities[0]!;
  city.buildings = { town_hall: 1, warehouse: 1, farm: 1, lumber_mill: 1, stone_quarry: 1 };
  city.resources = { food: 0, wood: 0, stone: 0, iron: 0 };
  city.productionAt = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
  store.armyManagement.tick(store.snapshot, Date.now());
  assert.equal(city.resources.food, 1500);
  assert.equal(city.resources.wood, 1500);
  assert.equal(city.resources.stone, 1500);
  assert.equal(city.resources.iron, 0);
  city.productionAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  store.armyManagement.tick(store.snapshot, Date.now());
  assert.equal(city.resources.food, 1500);
  assert.equal(city.resources.wood, 1500);
  assert.equal(city.resources.stone, 1500);
});

test("progression technologies modify their matching logistics systems", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  city.buildings = { town_hall: 1, warehouse: 3, farm: 1, lumber_mill: 1, stone_quarry: 1, hospital: 1 };
  city.resources = { food: 0, wood: 0, stone: 0, iron: 0 };
  city.productionAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  store.snapshot.technologyProgress[player.id] = { playerId: player.id, unlocked: ["crop_rotation", "sawmill_blades", "field_medicine", "road_engineering", "relay_stations", "quartermaster_drills"] };
  store.armyManagement.tick(store.snapshot, Date.now());
  assert.equal(city.resources.food, 720);
  assert.equal(city.resources.wood, 552);
  assert.equal(city.resources.stone, 414);
  const reserve = store.snapshot.troopReserves[city.id]!;
  reserve.wounded.archers = 20;
  store.armyManagement.heal("tech-heal-1", city.id, "archers", 20, player.id, store.snapshot);
  assert.equal(Date.parse(store.snapshot.hospitalQueues[city.id]!.items[0]!.completesAt) - Date.parse(store.snapshot.hospitalQueues[city.id]!.items[0]!.startedAt), 15_000);
});

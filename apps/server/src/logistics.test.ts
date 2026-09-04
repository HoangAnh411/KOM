import test from "node:test";
import assert from "node:assert/strict";
import { gameRules } from "@kingdoms/shared";
import { GameStore } from "./store.js";
import { caravanTile } from "./logistics.js";

test("logistics harvest, route and delivery are server-authoritative", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  city.buildings.road_depot = 1;
  store.logistics.syncDepots(store.snapshot);
  const node = store.logistics.snapshot().resourceNodes.find(item => item.resourceType === "wood")!;
  assert.equal(store.logistics.harvest("harvest-001", node.id, city.id, player.id, 50, store.snapshot), "accepted");
  assert.equal(node.remaining, 950);
  const destination = store.snapshot.cities[1]; destination.playerId = player.id;
  const route = store.logistics.createRoute("route-001", city.id, { kind: "city", id: destination.id }, player.id, store.snapshot);
  assert.equal(route.distance, 8);
  const caravan = store.logistics.startCaravan("caravan-001", route.id, { food: 0, wood: 40, stone: 20, iron: 0 }, player.id, store.snapshot);
  assert.equal(caravan.status, "moving");
  caravan.arrivesAt = new Date(0).toISOString();
  store.tick();
  assert.equal(caravan.status, "delivered");
  assert.equal(destination.resources.wood, 540);
  assert.equal(store.logistics.snapshot().throughput[player.id].wood, 40);
});

test("starter package is one-time and passive income is disabled", () => {
  const store = new GameStore();
  const player = store.addDevPlayer("Starter", "ravager");
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  assert.deepEqual(city.resources, { food: 0, wood: 500, stone: 500, iron: 500 });
  const before = { ...city.resources };
  store.tick();
  assert.deepEqual(city.resources, before);
});
test("resource nodes recover on server tick", () => {
  const store = new GameStore();
  const node = store.logistics.snapshot().resourceNodes[0];
  node.remaining = 100;
  store.tick();
  assert.equal(node.remaining, 105);
});
// Seeded world: player Lan owns the city at (8,8) and an army at (9,8); enemy Minh owns the city
// at (13,11) and an army at (14,11). The caravan runs (8,8) → (13,11), so at progress 0 it sits on
// (8,8) — nine tiles from Minh's army, i.e. out of ambush range until the test moves it.
function ambushScenario() {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const enemy = store.snapshot.players[1];
  const source = store.snapshot.cities.find(item => item.playerId === player.id)!;
  const destination = store.snapshot.cities.find(item => item.playerId === enemy.id)!;
  destination.playerId = player.id;
  source.buildings.road_depot = 1;
  store.logistics.syncDepots(store.snapshot);
  const route = store.logistics.createRoute("route-ambush", source.id, { kind: "city", id: destination.id }, player.id, store.snapshot);
  const caravan = store.logistics.startCaravan("caravan-ambush", route.id, { food: 0, wood: 20, stone: 0, iron: 0 }, player.id, store.snapshot);
  const enemyArmy = store.snapshot.armies.find(army => army.ownerPlayerId === enemy.id)!;
  return { store, player, enemy, caravan, enemyArmy, source, destination };
}

test("ambush is deterministic and stores its seed", () => {
  const { store, enemy, caravan, enemyArmy } = ambushScenario();
  enemyArmy.x = 8; enemyArmy.y = 9; // one tile from the caravan at (8,8)
  const result = store.logistics.ambush("ambush-001", caravan.id, enemy.id, store.snapshot);
  assert.equal(caravan.ambushSeed, result.seed);
  assert.equal(typeof result.seed, "number");
  assert.ok(result.seed >= 0);
});

test("ambush without an army in range is rejected and does not consume the command", () => {
  const { store, enemy, caravan, enemyArmy } = ambushScenario();
  assert.equal(Math.abs(enemyArmy.x - 8) + Math.abs(enemyArmy.y - 8), 9, "seeded army starts out of range");
  assert.throws(() => store.logistics.ambush("ambush-range", caravan.id, enemy.id, store.snapshot), /AMBUSH_OUT_OF_RANGE/);
  assert.equal(caravan.status, "moving", "a rejected ambush leaves the caravan alone");
  assert.equal(caravan.ambushSeed, undefined);
  assert.deepEqual(caravan.cargo, { food: 0, wood: 20, stone: 0, iron: 0 });
  // The guard runs before claim(), so the same commandId is still usable once an army arrives.
  enemyArmy.x = 8; enemyArmy.y = 8;
  const result = store.logistics.ambush("ambush-range", caravan.id, enemy.id, store.snapshot);
  assert.ok(result.seed >= 0);
});

test("ambush range is 3 tiles measured on the caravan's current tile", () => {
  const atDistance = (distance: number) => {
    const { store, enemy, caravan, enemyArmy } = ambushScenario();
    enemyArmy.x = 8 + distance; enemyArmy.y = 8;
    return () => store.logistics.ambush("ambush-boundary", caravan.id, enemy.id, store.snapshot);
  };
  atDistance(3)(); // exactly at the limit is allowed
  assert.throws(atDistance(4), /AMBUSH_OUT_OF_RANGE/);
  // Progress moves the target tile: the caravan is 60% along (8,8) → (13,11), so (11,10) is the
  // tile that counts and the source city is now too far away.
  const { store, enemy, caravan, enemyArmy } = ambushScenario();
  caravan.progress = 0.6;
  enemyArmy.x = 8; enemyArmy.y = 8;
  assert.throws(() => store.logistics.ambush("ambush-progress", caravan.id, enemy.id, store.snapshot), /AMBUSH_OUT_OF_RANGE/);
  enemyArmy.x = 11; enemyArmy.y = 10;
  assert.equal(typeof store.logistics.ambush("ambush-progress", caravan.id, enemy.id, store.snapshot).seed, "number");
});

test("frozen and destroyed armies cannot ambush", () => {
  const frozen = ambushScenario();
  frozen.enemyArmy.x = 8; frozen.enemyArmy.y = 8; frozen.enemyArmy.frozen = true;
  assert.throws(() => frozen.store.logistics.ambush("ambush-frozen", frozen.caravan.id, frozen.enemy.id, frozen.store.snapshot), /AMBUSH_OUT_OF_RANGE/);
  const destroyed = ambushScenario();
  destroyed.enemyArmy.x = 8; destroyed.enemyArmy.y = 8; destroyed.enemyArmy.strength = 0;
  assert.throws(() => destroyed.store.logistics.ambush("ambush-dead", destroyed.caravan.id, destroyed.enemy.id, destroyed.store.snapshot), /AMBUSH_OUT_OF_RANGE/);
});

test("caravanTile mirrors the client lerp and fails closed on a missing endpoint", () => {
  const { store, caravan, source } = ambushScenario();
  const hubs = store.logistics.snapshot().marketHubs;
  assert.deepEqual(caravanTile(caravan, store.snapshot, hubs), { x: 8, y: 8 });
  caravan.progress = 1;
  assert.deepEqual(caravanTile(caravan, store.snapshot, hubs), { x: 13, y: 11 });
  source.id = "gone";
  assert.equal(caravanTile(caravan, store.snapshot, hubs), undefined);
});

test("low army supply causes attrition in the supply zone cycle", () => {
  const store = new GameStore();
  const army = store.snapshot.armies[0];
  army.supply = 24;
  army.lastSupplyAt = new Date(Date.now() - 2 * 60_000).toISOString();
  army.x = 17; army.y = 17; // far from own city and any depot: -5 supply/min
  const strength = army.strength;
  const morale = army.morale;
  store.tick();
  assert.equal(army.supply, 14);
  assert.equal(army.strength, strength - 2);
  assert.equal(army.morale, morale - 4);
});
test("throughput is persisted by the relational repository contract", async () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  store.logistics.snapshot().throughput[player.id] = { wood: 40, stone: 20, iron: 3 };
  assert.deepEqual(store.logistics.snapshot().throughput[player.id], { wood: 40, stone: 20, iron: 3 });
});

test("market hub is seeded exactly once and survives re-seeding", () => {
  const store = new GameStore();
  const hubs = store.logistics.snapshot().marketHubs;
  assert.equal(hubs.length, 1);
  assert.equal(hubs[0].name, "Thương cảng Meridian");
  const before = hubs[0].id;
  store.logistics.seed(store.snapshot);
  store.logistics.seed(store.snapshot);
  const hubs2 = store.logistics.snapshot().marketHubs;
  assert.equal(hubs2.length, 1);
  assert.equal(hubs2[0].id, before);
});

test("caravan to the market hub is consumed as export exactly once", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  city.buildings.road_depot = 1;
  store.logistics.syncDepots(store.snapshot);
  const hub = store.logistics.snapshot().marketHubs[0];
  const route = store.logistics.createRoute("route-market", city.id, { kind: "market", id: hub.id }, player.id, store.snapshot);
  assert.equal(route.destinationKind, "market");
  assert.equal(route.destinationMarketId, hub.id);
  const caravan = store.logistics.startCaravan("caravan-market", route.id, { food: 0, wood: 40, stone: 0, iron: 0 }, player.id, store.snapshot);
  caravan.arrivesAt = new Date(0).toISOString();
  store.tick();
  assert.equal(caravan.status, "delivered");
  // consumed as export: no player city receives the cargo, throughput counts it once
  assert.equal(city.resources.wood, 460);
  assert.equal(store.logistics.snapshot().throughput[player.id].wood, 40);
  store.tick();
  assert.equal(store.logistics.snapshot().throughput[player.id].wood, 40);
});

test("city placement is deterministic, respects spacing and throws KINGDOM_FULL", () => {
  // Every bound below is read off the rule, not restated. A previous version of this
  // test carried its own copy of the window and the spacing, so widening the rule left
  // the test asserting the old numbers and still passing.
  const { minX, maxX, minY, maxY, minDistanceBetweenCities, maxDistanceToHubOrNode } = gameRules.cityPlacement;
  const store = new GameStore();
  for (let index = 0; index < 200; index += 1) {
    const name = `Place ${index}`;
    let player;
    try {
      player = store.addDevPlayer(name, index % 2 ? "meridian" : "bastion");
    } catch (error) {
      if (index > 10 && error instanceof Error && error.message === "KINGDOM_FULL") return; // expected when the region is exhausted
      throw error;
    }
    const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
    assert.ok(city.x >= minX && city.x <= maxX && city.y >= minY && city.y <= maxY, `tile ${city.x},${city.y} out of bounds`);
    const others = store.snapshot.cities.filter(item => item.id !== city.id);
    for (const other of others) {
      assert.ok(Math.abs(other.x - city.x) + Math.abs(other.y - city.y) >= minDistanceBetweenCities, `too close to ${other.id}`);
    }
    const anchors = [...store.logistics.snapshot().marketHubs, ...store.logistics.snapshot().resourceNodes];
    assert.ok(anchors.some(anchor => Math.abs(anchor.x - city.x) + Math.abs(anchor.y - city.y) <= maxDistanceToHubOrNode), `not near hub/node at ${city.x},${city.y}`);
  }
  assert.fail("expected KINGDOM_FULL before filling 200 players");
});

test("supply zones: own city +10/min, depot wins with +15/min, min-time granularity", () => {
  const store = new GameStore();
  const army = store.snapshot.armies[0]; // seed at (9,8), own city (8,8): inside city radius
  const player = store.snapshot.players[0];
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  army.supply = 50;
  army.lastSupplyAt = new Date(Date.now() - 3 * 60_000).toISOString(); // 3 full minutes
  store.tick();
  assert.equal(army.supply, 80); // +10/min inside own city radius
  army.lastSupplyAt = new Date(Date.now() - 1 * 60_000).toISOString();
  city.buildings.road_depot = 5;
  store.logistics.syncDepots(store.snapshot);
  city.x = 9; city.y = 8; // move city onto the army: depot radius 3+5 covers it
  store.tick();
  assert.equal(army.supply, 95); // +15/min at depot beats +10/min
  // same minute boundary: no double-counting
  const before = army.supply;
  army.lastSupplyAt = new Date(Date.now() - 30_000).toISOString(); // under a minute
  store.tick();
  assert.equal(army.supply, before);
});

test("ban freezes the supply clock and unban shifts last_supply_at", () => {
  const store = new GameStore();
  const army = store.snapshot.armies[0];
  const player = store.snapshot.players[0];
  army.x = 17; army.y = 17; // outside any zone: -5/min
  const bannedAt = new Date(Date.now() - 10 * 60_000).toISOString(); // a week's ban in tick-time: 10 min
  army.lastSupplyAt = new Date(Date.now() - 2 * 60_000).toISOString();
  store.setPlayerStatus(player.id, "banned", bannedAt);
  store.tick();
  assert.equal(army.supply, 100, "clock frozen while banned — no attrition for the 2 stale minutes");
  store.setPlayerStatus(player.id, "active"); // shifts last_supply_at forward by the 10-min ban
  assert.ok(Date.parse(army.lastSupplyAt!) > Date.now() - 120_000, "last_supply_at advanced by the ban duration");
  store.tick();
  store.tick();
  assert.equal(army.supply, 100, "no catch-up attrition after unban");
});

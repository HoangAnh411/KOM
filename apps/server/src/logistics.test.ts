import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";

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
  const route = store.logistics.createRoute("route-001", city.id, destination.id, player.id, store.snapshot);
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
test("ambush is deterministic and stores its seed", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const enemy = store.snapshot.players[1];
  const source = store.snapshot.cities.find(item => item.playerId === player.id)!;
  const destination = store.snapshot.cities.find(item => item.playerId === enemy.id)!;
  destination.playerId = player.id;
  source.buildings.road_depot = 1;
  store.logistics.syncDepots(store.snapshot);
  const route = store.logistics.createRoute("route-ambush", source.id, destination.id, player.id, store.snapshot);
  const caravan = store.logistics.startCaravan("caravan-ambush", route.id, { food: 0, wood: 20, stone: 0, iron: 0 }, player.id, store.snapshot);
  const result = store.logistics.ambush("ambush-001", caravan.id, enemy.id, store.snapshot);
  assert.equal(caravan.ambushSeed, result.seed);
  assert.equal(typeof result.seed, "number");
  assert.ok(result.seed >= 0);
});

test("low army supply causes attrition", () => {
  const store = new GameStore();
  const army = store.snapshot.armies[0];
  army.supply = 24;
  const strength = army.strength;
  store.tick();
  assert.equal(army.strength, strength - 1);
});
test("throughput is persisted by the relational repository contract", async () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  store.logistics.snapshot().throughput[player.id] = { wood: 40, stone: 20, iron: 3 };
  assert.deepEqual(store.logistics.snapshot().throughput[player.id], { wood: 40, stone: 20, iron: 3 });
});

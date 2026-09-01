import assert from "node:assert/strict";
import test from "node:test";
import { gameRules } from "@kingdoms/shared";
import type { Army, City, Depot, ResourceNode } from "@kingdoms/shared";
import { cargoTotal, cargoWithinCapacity, cargoWithinResources, caravanReady, hasEnemy, harvestReady, isOwnLiveArmy, mergeCandidates, routeReady } from "./validation.js";

const depot = (capacity: number): Depot => ({ cityId: "c1", level: 1, capacity });
const city = (resources: { wood: number; stone: number; iron: number }): City => ({ id: "c1", playerId: "p1", playerName: "P1", name: "Meridian", x: 5, y: 5, resources: { ...resources, food: 0 }, buildings: {}, queues: [] });
const node = (remaining: number): ResourceNode => ({ id: "n1", resourceType: "wood", x: 3, y: 3, remaining, capacity: 500, recoveryRate: 1, kingdomId: "k1", regionId: "r1" });
const army = (overrides: Partial<Army>): Army => ({ id: "a1", ownerPlayerId: "p1", unitType: "infantry", strength: 100, morale: 70, supply: 90, formation: "line", x: 1, y: 1, ...overrides }) as Army;

test("cargoTotal sums the three resources", () => {
  assert.equal(cargoTotal({ wood: 10, stone: 20, iron: 30 }), 60);
});

test("harvestReady rejects zero/negative and over-remaining amounts", () => {
  assert.equal(harvestReady(node(100), 0).ok, false);
  assert.equal(harvestReady(node(100), -5).ok, false);
  const over = harvestReady(node(25), 50);
  assert.equal(over.ok, false);
  assert.match(over.reason ?? "", /chỉ còn 25/);
  assert.equal(harvestReady(node(60), 25).ok, true);
});

test("cargoWithinCapacity requires a depot and positive cargo ≤ capacity", () => {
  assert.equal(cargoWithinCapacity(undefined, { wood: 10, stone: 0, iron: 0 }), false, "no depot");
  assert.equal(cargoWithinCapacity(depot(50), { wood: 0, stone: 0, iron: 0 }), false, "empty cargo");
  assert.equal(cargoWithinCapacity(depot(50), { wood: 30, stone: 30, iron: 0 }), false, "over capacity");
  assert.equal(cargoWithinCapacity(depot(50), { wood: 30, stone: 20, iron: 0 }), true);
});

test("cargoWithinResources compares each resource against the city stockpile", () => {
  const rich = city({ wood: 100, stone: 100, iron: 100 });
  assert.equal(cargoWithinResources(rich, { wood: 60, stone: 40, iron: 0 }), true);
  assert.equal(cargoWithinResources(rich, { wood: 200, stone: 0, iron: 0 }), false);
});

test("caravanReady reports a reason for every invalid state", () => {
  const depot50 = depot(50);
  const rich = city({ wood: 100, stone: 100, iron: 100 });
  const poor = city({ wood: 5, stone: 0, iron: 0 });
  assert.equal(caravanReady(depot50, rich, { wood: 0, stone: 0, iron: 0 }).ok, false);
  const noDepot = caravanReady(undefined, rich, { wood: 10, stone: 0, iron: 0 });
  assert.equal(noDepot.ok, false);
  assert.match(noDepot.reason ?? "", /trạm tiếp tế/);
  const overCap = caravanReady(depot50, rich, { wood: 30, stone: 30, iron: 0 });
  assert.equal(overCap.ok, false);
  assert.match(overCap.reason ?? "", /sức chứa/);
  assert.equal(caravanReady(depot50, poor, { wood: 10, stone: 0, iron: 0 }).ok, false, "insufficient resources");
  assert.equal(caravanReady(depot50, rich, { wood: 25, stone: 25, iron: 0 }).ok, true);
});

test("routeReady needs a depot and a destination", () => {
  assert.equal(routeReady(undefined, "hub1").ok, false);
  assert.equal(routeReady(depot(50), "").ok, false);
  assert.equal(routeReady(depot(50), "hub1").ok, true);
});

test("isOwnLiveArmy gates on ownership, strength and freeze", () => {
  const own = army({ ownerPlayerId: "p1" });
  assert.equal(isOwnLiveArmy(own, "p1"), true);
  assert.equal(isOwnLiveArmy(army({ ownerPlayerId: "p2" }), "p1"), false, "not owned");
  assert.equal(isOwnLiveArmy(army({ strength: 0 }), "p1"), false, "wiped out");
  assert.equal(isOwnLiveArmy(army({ frozen: true }), "p1"), false, "frozen");
  assert.equal(isOwnLiveArmy(undefined, "p1"), false, "no selection");
});

test("hasEnemy sees only living unfrozen opponents", () => {
  const enemies = [army({ id: "e1", ownerPlayerId: "p2" }), army({ id: "e2", ownerPlayerId: "p2", frozen: true })];
  assert.equal(hasEnemy(enemies, "p1"), true);
  assert.equal(hasEnemy([army({ id: "e3", ownerPlayerId: "p2", strength: 0 })], "p1"), false);
  assert.equal(hasEnemy([], "p1"), false);
});

test("mergeCandidates: same player, unit type and tile, sum under the 500 cap", () => {
  const source = army({ id: "a1", strength: 400 });
  const others = [army({ id: "c1", strength: 50 }), army({ id: "c2", strength: 150, x: 9, y: 9 }), army({ id: "c3", strength: 50, unitType: "archer" }), army({ id: "c4", strength: 50, frozen: true }), army({ id: "c5", strength: 50, ownerPlayerId: "p2" })];
  const matches = mergeCandidates([source, ...others], source, "p1");
  assert.deepEqual(matches.map(item => item.id), ["c1"], "only the same-tile same-type owned army");
  assert.equal(mergeCandidates([source, army({ id: "c6", strength: 200 })], source, "p1").length, 0, "400+200 exceeds the 500 cap");
  const capMin = gameRules.army.maxStrengthPerArmy;
  assert.equal(capMin, 500);
});

test("mergeCandidates excludes the army itself", () => {
  const source = army({ id: "a1", strength: 100 });
  assert.deepEqual(mergeCandidates([source], source, "p1"), []);
});
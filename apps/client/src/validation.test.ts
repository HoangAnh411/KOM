import assert from "node:assert/strict";
import test from "node:test";
import { gameRules } from "@kingdoms/shared";
import type { Army, City, Depot, ResourceNode } from "@kingdoms/shared";
import { affordable, buildQueueRoom, cargoTotal, cargoWithinCapacity, cargoWithinResources, caravanReady, depotFor, firstReason, frozenReason, hasEnemy, harvestReady, isOwnLiveArmy, mergeCandidates, notFrozen, routeReady } from "./validation.js";

const depot = (capacity: number): Depot => ({ cityId: "c1", level: 1, capacity });
const city = (resources: Partial<City["resources"]>): City => ({ id: "c1", playerId: "p1", playerName: "P1", name: "Meridian", x: 5, y: 5, resources: { food: 0, wood: 0, stone: 0, iron: 0, ...resources }, buildings: {}, queues: [] });
const node = (remaining: number): ResourceNode => ({ id: "n1", resourceType: "wood", x: 3, y: 3, remaining, capacity: 500, recoveryRate: 1, kingdomId: "k1", regionId: "r1" });
const army = (overrides: Partial<Army>): Army => ({ id: "a1", ownerPlayerId: "p1", unitType: "infantry", strength: 100, morale: 70, supply: 90, formation: "line", x: 1, y: 1, ...overrides }) as Army;

test("cargoTotal sums the three resources", () => {
  assert.equal(cargoTotal({ wood: 10, stone: 20, iron: 30 }), 60);
});

test("affordable names the resource that is short, not just that something is", () => {
  const rich = city({ wood: 100, stone: 100, iron: 100 });
  // What the player is blamed for, read back out of the sentence: the reason also
  // quotes the whole price, so matching the bare label would pass either way.
  const blamed = (reason?: string): string => /Không đủ ([^—]+)—/.exec(reason ?? "")?.[1]?.trim() ?? "";
  assert.deepEqual(affordable(rich, { wood: 100, stone: 100, iron: 100 }), { ok: true }, "exactly enough is enough");
  const short = affordable(rich, { wood: 150, stone: 80 });
  assert.equal(short.ok, false);
  assert.equal(blamed(short.reason), "Gỗ", "only the resource actually short is blamed");
  assert.match(short.reason ?? "", /cần 150 Gỗ · 80 Đá/, "and the price is quoted, so the player knows how far off they are");
  assert.equal(blamed(affordable(city({ wood: 0 }), { wood: 10, iron: 10 }).reason), "Gỗ, Sắt", "two shortfalls, display order");
});

test("affordable checks every resource, including ones nothing costs today", () => {
  // Written over `resourceKeys` rather than the three keys costs use now, so a
  // future food price is gated instead of silently passing.
  assert.equal(affordable(city({ food: 0, wood: 999 }), { food: 5 }).ok, false);
  assert.equal(affordable(city({ food: 5 }), { food: 5 }).ok, true);
  // A missing or zero key is not a shortfall, so a free building is affordable to
  // a city with nothing in it.
  assert.deepEqual(affordable(city({}), {}), { ok: true });
  assert.deepEqual(affordable(city({}), { wood: 0, stone: 0 }), { ok: true });
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
  // Case-insensitive on purpose: the reason names the building the way the city
  // panel spells it ("Trạm tiếp tế"), and what matters here is that the player is
  // pointed at the building, not how the sentence starts.
  assert.match(noDepot.reason ?? "", /trạm tiếp tế/i);
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

// The three gates the panels share. They exist so that "why is this button dead?"
// has one answer per condition instead of one per panel.

const queued = (type: "build" | "research", count: number): City["queues"] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${type}-${index}`, type, buildingId: "warehouse", targetLevel: 1, completesAt: "2026-09-03T00:00:00.000Z",
  }));

test("notFrozen speaks the one frozen wording, and only when the city is frozen", () => {
  const thawed = city({ wood: 100 });
  assert.deepEqual(notFrozen(thawed), { ok: true });
  assert.deepEqual(notFrozen({ ...thawed, frozen: false }), { ok: true }, "an explicit false is not frozen");
  assert.deepEqual(notFrozen({ ...thawed, frozen: true }), { ok: false, reason: frozenReason });
  // The wording is worth asserting because it used to be written three times in
  // three panels; a player reading two variants concludes there are two problems.
  assert.match(frozenReason, /đóng băng/);
});

test("firstReason returns the caller's first failing check, or nothing", () => {
  const pay = { ok: false, reason: "Không đủ Gỗ" };
  const freeze = { ok: false, reason: frozenReason };
  assert.equal(firstReason({ ok: true }, { ok: true }), undefined, "nothing to explain when every gate passes");
  assert.equal(firstReason(freeze, pay), frozenReason, "frozen outranks money because money is not the fixable thing");
  assert.equal(firstReason(pay, freeze), pay.reason, "…and the order is the caller's, not a hidden priority");
  assert.equal(firstReason({ ok: true }, pay), pay.reason);
  assert.equal(firstReason(), undefined, "no checks is not a failure");
  assert.equal(firstReason({ ok: false }), undefined, "a failing check with no wording explains nothing");
});

test("buildQueueRoom counts build jobs only, and quotes the count when full", () => {
  const empty = city({ wood: 500 });
  assert.deepEqual(buildQueueRoom(empty, 2), { ok: true });
  assert.deepEqual(buildQueueRoom({ ...empty, queues: queued("build", 1) }, 2), { ok: true });
  const full = buildQueueRoom({ ...empty, queues: queued("build", 2) }, 2);
  assert.equal(full.ok, false);
  assert.match(full.reason ?? "", /2\/2/, "the player is told how full, not just that it is");
  // Research shares the array but not the cap, so a researching city can still build.
  assert.deepEqual(buildQueueRoom({ ...empty, queues: queued("research", 3) }, 2), { ok: true });
  assert.equal(buildQueueRoom({ ...empty, queues: queued("build", 5) }, 2).ok, false, "over the cap stays closed");
});

test("depotFor picks the depot belonging to the city, not the first one", () => {
  const depots: Depot[] = [{ cityId: "c0", level: 2, capacity: 90 }, { cityId: "c1", level: 1, capacity: 50 }];
  assert.equal(depotFor(depots, "c1")?.capacity, 50);
  assert.equal(depotFor(depots, "c9"), undefined);
  assert.equal(depotFor([], "c1"), undefined);
});
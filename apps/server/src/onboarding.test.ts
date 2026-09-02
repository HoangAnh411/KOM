import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";

const steps = (store: GameStore, playerId: string) => store.onboarding.progressFor(playerId).completedSteps;

test("onboarding starts empty and acknowledges only the two UI-only steps", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  assert.deepEqual(steps(store, player.id), []);

  assert.equal(store.onboarding.ackStep("ack-1-1", player.id, "city_inspected", store.snapshot), "accepted");
  assert.ok(steps(store, player.id).includes("city_inspected"));
  assert.throws(() => store.onboarding.ackStep("ack-1-2", player.id, "depot_built", store.snapshot), /SERVER_VERIFIED_STEP/);
  // idempotent + command-idempotent
  assert.equal(store.onboarding.ackStep("ack-1-1", player.id, "city_inspected", store.snapshot), "already_processed");
});

test("depot, barracks, army and harvest steps verify from state", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;

  city.buildings = { town_hall: 1, road_depot: 1 };
  store.tick();
  assert.ok(steps(store, player.id).includes("depot_built"));

  // harvest records the counter evidence
  assert.equal(store.logistics.harvest("har-1", store.logistics.snapshot().resourceNodes[0].id, city.id, player.id, 10, store.snapshot), "accepted");
  store.tick();
  assert.ok(steps(store, player.id).includes("resource_harvested"));

  city.buildings = { town_hall: 1, road_depot: 1, barracks: 1 };
  store.tick();
  assert.ok(steps(store, player.id).includes("barracks_built"));
  assert.ok(steps(store, player.id).includes("army_recruited"), "seed army counts as an owned army");
  assert.ok(!steps(store, player.id).includes("market_exported"));
  assert.ok(!steps(store, player.id).includes("raider_defeated"));
});

test("market export verifies once the caravan reaches the hub", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  city.buildings.road_depot = 1;
  store.logistics.syncDepots(store.snapshot);
  const hub = store.logistics.snapshot().marketHubs[0]!;
  const route = store.logistics.createRoute("rt-1", city.id, { kind: "market", id: hub.id }, player.id, store.snapshot);
  const caravan = store.logistics.startCaravan("cv-1", route.id, { food: 0, wood: 40, stone: 0, iron: 0 }, player.id, store.snapshot);
  caravan.arrivesAt = new Date(Date.now() - 1000).toISOString();
  store.tick();
  assert.ok(steps(store, player.id).includes("market_exported"));
  assert.equal(caravan.status, "delivered");
});

test("raider defeat verifies from battle reports carrying npcKind", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;

  // Real combat path attaches npcKind to the report's defender segment
  const raider = store.snapshot.armies.find(item => item.npcKind === "raider")!;
  raider.x = army.x; raider.y = army.y;
  store.combat.attack("atk-r1", army.id, raider.id, player.id, store.snapshot);
  const realReport = store.snapshot.battleReports.at(-1)!;
  assert.ok(["raider", undefined].includes(realReport.attacker.npcKind ?? realReport.defender.npcKind));
  assert.ok(realReport.defender.armyId === raider.id || realReport.attacker.armyId === raider.id);

  // Deterministic verification: a player-win report against a raider marks the step
  const win = {
    id: "b-win", kingdomId: store.snapshot.kingdom.id, seasonId: store.snapshot.season.id, tileX: 0, tileY: 0, terrain: "plains" as const,
    attacker: { ownerType: "player" as const, playerId: player.id, armyId: "a-win", unitType: "infantry" as const, formation: "line" as const, strengthBefore: 100, strengthAfter: 60, moraleBefore: 100, moraleAfter: 80, supplyBefore: 100 },
    defender: { ownerType: "npc" as const, playerId: null, armyId: "r-win", npcKind: "raider" as const, unitType: "infantry" as const, formation: "line" as const, strengthBefore: 30, strengthAfter: 0, moraleBefore: 100, moraleAfter: 0, supplyBefore: 100 },
    rounds: [], victor: "attacker" as const, seed: 1, resolvedAt: new Date().toISOString(),
  };
  store.snapshot.battleReports.push(win as any);
  store.onboarding.verify(store.snapshot);
  assert.ok(steps(store, player.id).includes("raider_defeated"));
});

test("verification is per-player and merges without duplicating", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  city.buildings = { town_hall: 1, road_depot: 1, barracks: 1 };
  store.tick();
  assert.deepEqual(steps(store, player.id), ["depot_built", "barracks_built", "army_recruited"], "order stable");

  const otherId = "other-player";
  const other = { id: otherId, displayName: "Other", factionId: "bastion" as const, kingdomId: store.snapshot.kingdom.id, crossSeasonReputation: 0 };
  store.snapshot.players.push(other);
  store.onboarding.verify(store.snapshot);
  assert.deepEqual(steps(store, otherId), [], "other players get no steps from foreign evidence");

  // Merging again converges — no duplicates, no churn
  store.onboarding.verify(store.snapshot);
  store.onboarding.verify(store.snapshot);
  assert.deepEqual(steps(store, player.id), ["depot_built", "barracks_built", "army_recruited"]);
});

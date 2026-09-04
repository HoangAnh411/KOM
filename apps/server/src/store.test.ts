import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";
import { gameRules } from "@kingdoms/shared";

test("build commands enforce ownership, costs, and the two-queue limit", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const city = store.snapshot.cities.find((item) => item.playerId === player.id)!;
  assert.equal(store.startBuild(player.id, "command-001", city.id, "warehouse", "build"), "accepted");
  assert.equal(store.startBuild(player.id, "command-002", city.id, "road_depot", "build"), "accepted");
  assert.throws(() => store.startBuild(player.id, "command-003", city.id, "warehouse", "build"), /QUEUE_LIMIT_REACHED/);
  assert.throws(() => store.startBuild(store.snapshot.players[1].id, "command-004", city.id, "warehouse", "build"), /CITY_ACCESS_DENIED/);
  assert.equal(store.startBuild(player.id, "command-001", city.id, "warehouse", "build"), "already_processed");
});

test("the server charges exactly the price the client shows", () => {
  // `buildingCosts` is derived from `gameRules.buildings` rather than restated, and
  // this is the assertion that keeps it derived: if someone reintroduces a local
  // table, the first price they get wrong fails here instead of in a player's city.
  for (const building of Object.values(gameRules.buildings)) {
    const store = new GameStore();
    const player = store.snapshot.players[0]!;
    const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
    const before = { ...city.resources };
    assert.equal(store.startBuild(player.id, `cost-${building.id}`, city.id, building.id, "build"), "accepted");
    for (const key of ["food", "wood", "stone", "iron"] as const)
      assert.equal(city.resources[key], before[key] - building.cost[key], `${building.id} charged the wrong ${key}`);
    const queue = city.queues.at(-1)!;
    assert.equal(Date.parse(queue.completesAt) - Date.parse(queue.startedAt), building.durationSeconds * 1000, `${building.id} build time`);
  }
});

test("command transaction restores domain state and ledger when the action fails", async () => {
  const store = new GameStore(); const player = store.snapshot.players[0]; const city = store.snapshot.cities.find(item => item.playerId === player.id)!; const before = city.resources.wood;
  await assert.rejects(store.executeCommand({ eventType: "test.accepted", aggregateType: "test", aggregateId: player.id, commandId: "rollback-command", actorPlayerId: player.id }, () => { city.resources.wood -= 50; throw new Error("COMMAND_FAILED"); }), /COMMAND_FAILED/);
  assert.equal(store.snapshot.cities.find(item => item.id === city.id)!.resources.wood, before); assert.equal(store.ledger.hasCommand("rollback-command"), false);
});

test("supply catch-up applies attrition only for minutes actually below the threshold", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  for (const raider of store.snapshot.armies.filter(item => item.ownerType === "npc" && item.npcKind === "raider")) raider.nextActionAt = new Date(Date.now() + 3600_000).toISOString();
  army.x = 0; army.y = 0; // far outside the city radius and any depot
  army.supply = 40; army.strength = 100; army.morale = 100;
  army.lastSupplyAt = new Date(Date.now() - 20 * 60_000).toISOString(); // 20 minutes offline
  store.tick();
  // 40 supply at -5/min hits 25 after 3 minutes, so only the remaining 17 minutes are attrition.
  assert.equal(army.supply, 0, "supply drained fully at -5/min over 20 minutes");
  assert.equal(army.strength, 83, "one strength lost per minute below threshold (20 - 3)");
  assert.equal(army.morale, 66, "two morale lost per minute below threshold (20 - 3)");
});

test("player-vs-raider battles are audited in the ledger", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  const raider = store.snapshot.armies.find(item => item.ownerType === "npc" && item.npcKind === "raider")!;
  army.x = 5; army.y = 5; raider.x = 6; raider.y = 5; // one tile apart: pursuit
  raider.nextActionAt = new Date(Date.now() + 3600_000).toISOString();
  store.combat.attack("cmd-raid-1", army.id, raider.id, player.id, store.snapshot);
  assert.ok(army.attackOrder, "pursuit order issued");
  store.tick();
  assert.ok(store.ledger.all().some(event => event.eventType === "combat.resolved"
    && (event.payload as { defenderArmyId: string }).defenderArmyId === raider.id),
    "combat.resolved must be recorded when a player chases and fights a raider");
});

test("rollback releases combat/onboarding claims so a retry with the same commandId applies after a failed persist", async () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  city.buildings.barracks = 1;
  city.resources = { wood: 500, stone: 500, iron: 500, food: 0 };
  const commandId = "persist-failed-1";

  // The action mutates combat and onboarding state, then fails below the
  // command layer (simulating an aborted persist).
  await assert.rejects(store.executeCommand({ eventType: "recruit.accepted", aggregateType: "recruit", aggregateId: player.id, commandId, actorPlayerId: player.id }, () => {
    store.combat.recruit(commandId, city.id, "infantry", 10, player.id, store.snapshot);
    store.onboarding.ackStep(`${commandId}:ack`, player.id, "city_inspected", store.snapshot);
    store.snapshot.armies.push({ id: "must-not-survive", ownerType: "player", ownerPlayerId: player.id, x: 0, y: 0, unitType: "infantry", strength: 1, morale: 100, formation: "line", supply: 100, lastSupplyAt: new Date().toISOString() });
    throw new Error("PERSIST_FAILED");
  }), /PERSIST_FAILED/);
  assert.equal(store.snapshot.armies.some(army => army.id === "must-not-survive"), false, "domain state restored");
  assert.equal(store.onboarding.progressFor(player.id).completedSteps.length, 0, "onboarding progress rolled back");
  assert.equal(store.ledger.hasCommand(commandId), false, "no ledger residue");

  // The claims were released: a retry with the same commandId applies anew.
  const retry = await store.executeCommand({ eventType: "recruit.accepted", aggregateType: "recruit", aggregateId: player.id, commandId, actorPlayerId: player.id }, () => {
    store.combat.recruit(commandId, city.id, "infantry", 10, player.id, store.snapshot);
    store.onboarding.ackStep(`${commandId}:ack`, player.id, "city_inspected", store.snapshot);
    return "accepted";
  });
  assert.equal(retry.alreadyApplied, false);
  assert.equal(retry.result, "accepted");
  assert.equal(store.snapshot.armies.filter(army => army.ownerPlayerId === player.id).length, 2, "retry applied the recruit");
  assert.equal(store.snapshot.cities.find(item => item.id === city.id)!.resources.wood, 450, "cost deducted exactly once");
  assert.deepEqual(store.onboarding.progressFor(player.id).completedSteps, ["city_inspected"], "retry re-applied the ack");
});

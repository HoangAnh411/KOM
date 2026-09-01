import test from "node:test";
import assert from "node:assert/strict";
import type { Pool, PoolClient } from "pg";
import { EspionageRepository } from "./espionage.js";
import { WorldEventEngine } from "./world-events.js";
import { createSeedState } from "./store.js";

test("spy launch applies cost, cooldown and veiled bonus", () => {
  const state = createSeedState();
  const repo = new EspionageRepository();
  const mission = repo.launchMission("spy-launch-1", state.players[1].id, "scout", state.players[0].id, state);
  assert.equal(mission.accuracy, 0.6);
  assert.equal(mission.cost.iron, 50);
  assert.equal(state.cities[0].resources.iron, 450);
  assert.throws(() => repo.launchMission("spy-launch-2", state.players[1].id, "scout", state.players[0].id, state), /SPY_COOLDOWN/);
});

test("veiled spy missions are cheaper and more accurate", () => {
  const state = createSeedState();
  state.players[0].factionId = "veiled";
  const repo = new EspionageRepository();
  const mission = repo.launchMission("spy-launch-3", state.players[1].id, "scout", state.players[0].id, state);
  assert.equal(mission.accuracy, 0.72);
  assert.equal(mission.cost.iron, 40);
});

test("completed steal is capped at 100 per resource", () => {
  const state = createSeedState();
  const repo = new EspionageRepository();
  const mission = repo.launchMission("spy-steal-1", state.players[1].id, "steal", state.players[0].id, state);
  mission.completesAt = new Date(0).toISOString();
  repo.tick(state);
  const stolen = (mission.report as { stolen: Record<string, number> }).stolen;
  assert.ok(Object.values(stolen).every(value => value <= 100));
  assert.equal(mission.status, "success");
});

test("world event modifiers affect harvest and plague affects armies", () => {
  const state = createSeedState();
  const engine = new WorldEventEngine();
  const now = Date.now();
  state.worldEvents.push({ id: "event-1", kingdomId: state.kingdom.id, eventType: "drought", affectedTiles: [{ x: 6, y: 8 }], modifier: { harvest: 0.5 }, startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 100000).toISOString(), severity: 1 });
  assert.equal(engine.harvestModifier(6, 8, state), 0.5);
  state.worldEvents.push({ id: "event-2", kingdomId: state.kingdom.id, eventType: "plague", affectedTiles: [{ x: 9, y: 8 }], modifier: {}, startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 100000).toISOString(), severity: 1 });
  const army = state.armies[0]; engine.tick(state); assert.equal(army.strength, 95);
});

test("expired world events are removed", () => {
  const state = createSeedState();
  const engine = new WorldEventEngine();
  state.worldEvents.push({ id: "event-expired", kingdomId: state.kingdom.id, eventType: "drought", affectedTiles: [], modifier: { harvest: 0.5 }, startsAt: new Date(0).toISOString(), endsAt: new Date(0).toISOString(), severity: 1 });
  engine.tick(state);
  assert.equal(state.worldEvents.length, 0);
});

test("counter-intelligence enforces its configured cooldown", () => {
  const state = createSeedState();
  const repo = new EspionageRepository();
  repo.activateCounterIntel("counter-intel-1", state.players[0].id, state);
  assert.throws(() => repo.activateCounterIntel("counter-intel-2", state.players[0].id, state), /SPY_COOLDOWN/);
});

test("espionage persistence upserts mission fields and cooldowns", async () => {
  const state = createSeedState();
  const repo = new EspionageRepository();
  const mission = repo.launchMission("spy-persist-1", state.players[1].id, "scout", state.players[0].id, state);
  mission.status = "success";
  mission.report = { resources: { wood: 100 } };
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [] };
    }
  } as unknown as PoolClient;

  await repo.persist(client, state);

  const missionCall = calls.find(call => call.sql.startsWith("INSERT INTO espionage_actions"));
  assert.ok(missionCall);
  assert.match(missionCall.sql, /status=EXCLUDED\.status/);
  assert.equal(missionCall.values?.[6], "success");
  assert.equal(missionCall.values?.[11], JSON.stringify(mission.report));
  const cooldownCall = calls.find(call => call.sql.startsWith("INSERT INTO spy_cooldowns"));
  assert.ok(cooldownCall);
  assert.equal(cooldownCall.values?.[0], state.players[0].id);
  assert.equal(cooldownCall.values?.[1], "scout");
});

test("espionage cooldowns are restored from PostgreSQL", async () => {
  const state = createSeedState();
  const availableAt = new Date(Date.now() + 60_000);
  const pool = {
    query: async (sql: string) => {
      if (sql.includes("FROM spy_cooldowns")) return { rows: [{ player_id: state.players[0].id, mission_type: "scout", available_at: availableAt }] };
      return { rows: [] };
    }
  } as unknown as Pool;
  const repo = new EspionageRepository(pool);

  await repo.load(state);

  assert.throws(() => repo.launchMission("spy-restored-cooldown-1", state.players[1].id, "scout", state.players[0].id, state), /SPY_COOLDOWN/);
});

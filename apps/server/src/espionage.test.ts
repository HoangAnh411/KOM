import test from "node:test";
import assert from "node:assert/strict";
import type { Pool, PoolClient } from "pg";
import { misinformationEffectSeconds, spyMissionConfig } from "@kingdoms/shared";
import { EspionageRepository } from "./espionage.js";
import { CommandRegistry } from "./command-registry.js";
import { EventLedger } from "./event-ledger.js";
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

// === MISINFORMATION ===
//
// A plants a lie on B; the effect runs the other way, distorting what B's scouts
// read about A. Every roll in this domain hashes the mission id, and a real id is
// a `randomUUID()`, so the tests below overwrite it after launch: `misinfo-1`
// hashes even (the lie inflates), `misinfo-2` odd (it deflates), and `lie-6`
// lands on 0 of 100, inside any interception window. That is what makes these
// known-answer tests instead of coin flips.
//
// The honest scout for comparison reads `500 × (0.8 + 0.6 × 0.2)` = 460 wood and
// `100 × 0.6` = 60 strength.
const inflatedFactor = 1.475; // 1 + (0.25 + 0.45 × 0.5), sign from hash("misinfo-1")
const deflatedFactor = 0.525; // 1 − the same magnitude, sign from hash("misinfo-2")

type ScoutReport = { resources: Record<string, number>; buildings: Record<string, number>; armies: { id: string; strength: number }[] };

function plantLie(lieId: string, ledger?: EventLedger) {
  const state = createSeedState();
  const repo = new EspionageRepository(undefined, new CommandRegistry(), ledger);
  const [liar, victim] = state.players;
  const lie = repo.launchMission("misinfo-command-01", victim.id, "misinformation", liar.id, state);
  lie.id = lieId;
  lie.completesAt = new Date(1_000).toISOString();
  repo.tick(state);
  return { state, repo, lie, liar, victim, city: state.cities.find(city => city.playerId === liar.id)! };
}

/** The victim scouting the liar back — the only direction the planted lie touches. */
function scoutBack(context: ReturnType<typeof plantLie>, completesAt = 2_000): ScoutReport {
  const scout = context.repo.launchMission("scout-command-01", context.liar.id, "scout", context.victim.id, context.state);
  scout.completesAt = new Date(completesAt).toISOString();
  context.repo.tick(context.state);
  return scout.report as ScoutReport;
}

test("a planted lie expires on the mission's own schedule, not on when the tick ran", () => {
  const { lie } = plantLie("misinfo-1");
  assert.equal(lie.status, "success");
  assert.equal(lie.cost.iron, spyMissionConfig.misinformation.baseCost);
  assert.equal((lie.report as { plantedUntil: string }).plantedUntil, new Date(1_000 + misinformationEffectSeconds * 1_000).toISOString());
});

test("no lie can stand permanently: the effect is shorter than its own cooldown", () => {
  // Re-planting before the previous lie lapsed would blind an opponent for good.
  assert.ok(misinformationEffectSeconds < spyMissionConfig.misinformation.cooldownSeconds,
    `effect ${misinformationEffectSeconds}s must stay under the ${spyMissionConfig.misinformation.cooldownSeconds}s cooldown`);
});

test("a live lie skews every number of one scout report by the same factor", () => {
  const context = plantLie("misinfo-1");
  context.city.buildings.barracks = 4;
  const report = scoutBack(context);
  assert.equal(report.resources.wood, Math.round(500 * inflatedFactor), "wood inflated, not merely fuzzy");
  assert.equal(report.resources.iron, Math.round((500 - spyMissionConfig.misinformation.baseCost) * inflatedFactor));
  assert.equal(report.buildings.barracks, Math.round(4 * inflatedFactor));
  assert.equal(report.armies[0]!.strength, Math.round(100 * inflatedFactor));
  // The report is a story about the city, never a window onto it.
  assert.notEqual(report.buildings, context.city.buildings);
  assert.equal(context.city.buildings.barracks, 4);
  assert.equal(context.city.resources.wood, 500);
});

test("the lie reads low as often as it reads high", () => {
  // A defender who always looked stronger than they are would be the tell.
  const report = scoutBack(plantLie("misinfo-2"));
  assert.equal(report.resources.wood, Math.round(500 * deflatedFactor));
  assert.equal(report.armies[0]!.strength, Math.round(100 * deflatedFactor));
});

test("an expired lie leaves the scout report honest again", () => {
  const report = scoutBack(plantLie("misinfo-1"), 1_000 + misinformationEffectSeconds * 1_000 + 1);
  assert.equal(report.resources.wood, 460);
  assert.equal(report.armies[0]!.strength, 60);
});

test("counter-intelligence intercepts misinformation, and nothing gets planted", () => {
  const state = createSeedState();
  const repo = new EspionageRepository();
  const [liar, victim] = state.players;
  repo.activateCounterIntel("counter-intel-misinfo", victim.id, state);
  const lie = repo.launchMission("misinfo-command-02", victim.id, "misinformation", liar.id, state);
  lie.id = "lie-6";
  lie.completesAt = new Date(1_000).toISOString();
  repo.tick(state);
  assert.equal(lie.status, "intercepted");
  const scout = repo.launchMission("scout-command-02", liar.id, "scout", victim.id, state);
  scout.completesAt = new Date(2_000).toISOString();
  repo.tick(state);
  assert.equal((scout.report as ScoutReport).resources.wood, 460, "an intercepted lie distorts nothing");
});

test("an unfreeze pushes a planted lie out by however long the ban held it", () => {
  const context = plantLie("misinfo-1");
  const before = Date.parse((context.lie.report as { plantedUntil: string }).plantedUntil);
  context.repo.setPlayerFrozen(context.liar.id, false, 60_000, context.state);
  assert.equal(Date.parse((context.lie.report as { plantedUntil: string }).plantedUntil), before + 60_000);
});

test("resolved missions and consumed lies are audited in the event ledger", () => {
  // The launch is audited by the command path; the outcome happens minutes later
  // inside `tick()`, and without this the only record of why a scout report was
  // wrong would be the wrong report itself.
  const ledger = new EventLedger();
  const context = plantLie("misinfo-1", ledger);
  scoutBack(context);
  const planted = ledger.all().find(event => event.eventType === "spy.misinformation.success");
  assert.equal(planted?.aggregateId, "misinfo-1");
  assert.equal(planted?.actorPlayerId, context.liar.id);
  const consumed = ledger.all().find(event => event.eventType === "spy.misinformation.consumed");
  assert.equal(consumed?.aggregateId, "misinfo-1");
  assert.equal((consumed?.payload as { scoutPlayerId: string }).scoutPlayerId, context.victim.id);
  assert.equal((consumed?.payload as { factor: number }).factor, inflatedFactor);
  assert.ok(ledger.all().some(event => event.eventType === "spy.scout.success"), "every mission type is audited, not just the new one");
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

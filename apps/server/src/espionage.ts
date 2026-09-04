import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { misinformationEffectSeconds, spyMissionConfig, type SpyMission, type SpyMissionType, type Resources } from "@kingdoms/shared";
import type { GameState, Player } from "./types.js";
import { CommandRegistry } from "./command-registry.js";
import { EventLedger } from "./event-ledger.js";

const emptyCost = (iron: number): Resources => ({ food: 0, wood: 0, stone: 0, iron });
const hash = (value: string) => Array.from(value).reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 17);

/** What a resolved `misinformation` mission leaves behind: the instant its lie
 *  stops working. It lives in the mission's own `report`, which is already a
 *  JSONB column and already persisted and reloaded, so a planted lie survives a
 *  restart without a migration. */
type MisinformationReport = { plantedUntil: string };

/** How far a live lie skews every number in a scout report. The magnitude comes
 *  from the planting mission's accuracy — a better operative plants a bigger lie,
 *  and Veiled's 1.2× accuracy bonus therefore buys a bolder one — while the sign
 *  comes from `hash(id)`, the same deterministic roll sabotage uses to pick a
 *  building. The sign has to be unpredictable: a defender who always read as
 *  *stronger* than they are would be a tell, and the target would learn to halve
 *  every report instead of distrusting it. */
const misinformationFactor = (mission: SpyMission): number => {
  const magnitude = 0.25 + mission.accuracy * 0.5;
  return hash(mission.id) % 2 === 0 ? 1 + magnitude : 1 - magnitude;
};

export class EspionageRepository {
  private cooldowns = new Map<string, number>();
  // Claimed command ids used to be pushed into `state.processedCommands` (the `game_state` JSONB
  // row) on success. They now go through the shared bounded registry, which the store rolls back
  // when a command throws, so a mission that failed on cost is retryable with the same id.
  //
  // The ledger is defaulted the way `RaiderEngine` defaults it: missions resolve inside `tick()`,
  // so the audit trail for an outcome cannot be written by the command path that launched it.
  constructor(private readonly pool?: Pool, private readonly commands: CommandRegistry = new CommandRegistry(), private readonly ledger: EventLedger = new EventLedger()) {}
  capture(): Array<[string, number]> { return [...this.cooldowns]; }
  restore(cooldowns: Array<[string, number]>): void { this.cooldowns = new Map(cooldowns); }
  resetForSeason(): void { this.cooldowns.clear(); }
  seed(state: GameState): void { state.spyMissions ??= []; state.counterIntelActive ??= {}; }
  // Unfreeze catch-up: every timer a ban paused moves out by how long it was paused. A planted lie
  // is one of those timers — `tick()` refuses to resolve a mission whose actor or target is banned,
  // so scouts aimed at the frozen player were held too, and letting the lie tick down while nothing
  // could consume it would silently shorten the effect the player paid for.
  setPlayerFrozen(playerId: string, frozen: boolean, deltaMs: number, state: GameState): void { if (frozen || deltaMs <= 0) return; for (const mission of state.spyMissions.filter(item => item.status === "in_progress" && (item.actorPlayerId === playerId || item.targetPlayerId === playerId))) mission.completesAt = new Date(Date.parse(mission.completesAt) + deltaMs).toISOString(); for (const mission of state.spyMissions.filter(item => item.missionType === "misinformation" && item.status === "success" && (item.actorPlayerId === playerId || item.targetPlayerId === playerId))) { const report = mission.report as MisinformationReport | undefined; if (report?.plantedUntil) report.plantedUntil = new Date(Date.parse(report.plantedUntil) + deltaMs).toISOString(); } if (state.counterIntelActive[playerId]) state.counterIntelActive[playerId] = new Date(Date.parse(state.counterIntelActive[playerId]) + deltaMs).toISOString(); for (const [key, availableAt] of this.cooldowns) if (key.startsWith(`${playerId}:`)) this.cooldowns.set(key, availableAt + deltaMs); }
  async load(state: GameState): Promise<void> {
    this.seed(state);
    if (!this.pool) return;
    try {
      const missions = await this.pool.query("SELECT id, kingdom_id AS \"kingdomId\", actor_player_id AS \"actorPlayerId\", target_player_id AS \"targetPlayerId\", mission_type AS \"missionType\", status, accuracy, cost, started_at AS \"startedAt\", completes_at AS \"completesAt\", report FROM espionage_actions WHERE kingdom_id = $1", [state.kingdom.id]);
      state.spyMissions = missions.rows;
      const counterIntel = await this.pool.query("SELECT player_id, expires_at FROM counter_intel_active WHERE expires_at > now()");
      state.counterIntelActive = {};
      for (const row of counterIntel.rows) state.counterIntelActive[row.player_id] = new Date(row.expires_at).toISOString();
      const cooldowns = await this.pool.query("SELECT player_id, mission_type, available_at FROM spy_cooldowns WHERE available_at > now()");
      this.cooldowns.clear();
      for (const row of cooldowns.rows) this.cooldowns.set(`${row.player_id}:${row.mission_type}`, new Date(row.available_at).getTime());
    } catch (e) {
      console.warn("espionage load skipped", e instanceof Error ? e.message : e);
    }
  }
  async persist(client: PoolClient, state: GameState): Promise<void> {
    for (const mission of state.spyMissions) {
      await client.query(
        "INSERT INTO espionage_actions (id, kingdom_id, actor_player_id, target_player_id, action_type, mission_type, status, accuracy, cost, started_at, completes_at, report) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET mission_type=EXCLUDED.mission_type, status=EXCLUDED.status, accuracy=EXCLUDED.accuracy, cost=EXCLUDED.cost, started_at=EXCLUDED.started_at, completes_at=EXCLUDED.completes_at, report=EXCLUDED.report",
        [mission.id, mission.kingdomId, mission.actorPlayerId, mission.targetPlayerId, mission.missionType, mission.missionType, mission.status, mission.accuracy, JSON.stringify(mission.cost), mission.startedAt, mission.completesAt, mission.report === undefined ? null : JSON.stringify(mission.report)]
      );
    }
    for (const [playerId, expiresAt] of Object.entries(state.counterIntelActive)) {
      await client.query("INSERT INTO counter_intel_active (player_id, activated_at, expires_at) VALUES ($1, now(), $2) ON CONFLICT (player_id) DO UPDATE SET expires_at=EXCLUDED.expires_at", [playerId, expiresAt]);
    }
    await client.query("DELETE FROM spy_cooldowns WHERE available_at <= now()");
    for (const [key, availableAt] of this.cooldowns) {
      if (availableAt <= Date.now()) continue;
      const separator = key.lastIndexOf(":");
      const playerId = key.slice(0, separator);
      const missionType = key.slice(separator + 1);
      await client.query("INSERT INTO spy_cooldowns (player_id, mission_type, available_at) VALUES ($1,$2,$3) ON CONFLICT (player_id, mission_type) DO UPDATE SET available_at=EXCLUDED.available_at", [playerId, missionType, new Date(availableAt).toISOString()]);
    }
  }
  launchMission(commandId: string, targetPlayerId: string, missionType: Exclude<SpyMissionType, "counter_intel">, playerId: string, state: GameState): SpyMission { if (!this.commands.claim(commandId)) throw new Error("already_processed"); const actor = state.players.find(p => p.id === playerId); const target = state.players.find(p => p.id === targetPlayerId); if (!actor || !target || actor.id === target.id) throw new Error("INVALID_TARGET"); if (actor.status === "banned") throw new Error("ACCOUNT_BANNED"); if (target.status === "banned") throw new Error("TARGET_FROZEN"); const cfg = spyMissionConfig[missionType]; const cooldownKey = `${playerId}:${missionType}`; if ((this.cooldowns.get(cooldownKey) ?? 0) > Date.now()) throw new Error("SPY_COOLDOWN"); const city = state.cities.find(c => c.playerId === playerId); if (!city) throw new Error("CITY_ACCESS_DENIED"); const veiled = actor.factionId === "veiled"; const cost = emptyCost(Math.floor(cfg.baseCost * (veiled ? 0.8 : 1))); if (city.resources.iron < cost.iron) throw new Error("INSUFFICIENT_RESOURCES"); city.resources.iron -= cost.iron; const now = Date.now(); const accuracy = Math.min(1, cfg.baseAccuracy * (veiled ? 1.2 : 1)); const mission: SpyMission = { id: randomUUID(), kingdomId: state.kingdom.id, actorPlayerId: playerId, targetPlayerId, missionType, status: "in_progress", accuracy, cost, startedAt: new Date(now).toISOString(), completesAt: new Date(now + cfg.durationSeconds * 1000).toISOString() }; state.spyMissions.push(mission); this.cooldowns.set(cooldownKey, now + cfg.cooldownSeconds * 1000 * (veiled ? 0.85 : 1)); return mission; }
  activateCounterIntel(commandId: string, playerId: string, state: GameState): string { if (!this.commands.claim(commandId)) return "already_processed"; const city = state.cities.find(c => c.playerId === playerId); const player = state.players.find(p => p.id === playerId); if (!city || !player) throw new Error("CITY_ACCESS_DENIED"); if (player.status === "banned") throw new Error("ACCOUNT_BANNED"); const cfg = spyMissionConfig.counter_intel; const cooldownKey = `${playerId}:counter_intel`; if ((this.cooldowns.get(cooldownKey) ?? 0) > Date.now()) throw new Error("SPY_COOLDOWN"); const veiled = player.factionId === "veiled"; const cost = Math.floor(cfg.baseCost * (veiled ? 0.8 : 1)); if (city.resources.iron < cost) throw new Error("INSUFFICIENT_RESOURCES"); city.resources.iron -= cost; const now = Date.now(); state.counterIntelActive[playerId] = new Date(now + 30 * 60 * 1000).toISOString(); this.cooldowns.set(cooldownKey, now + cfg.cooldownSeconds * 1000 * (veiled ? 0.85 : 1)); return "accepted"; }
  tick(state: GameState): boolean { let changed = false; const now = Date.now(); for (const [id, expires] of Object.entries(state.counterIntelActive)) if (state.players.find(player => player.id === id)?.status !== "banned" && Date.parse(expires) <= now) { delete state.counterIntelActive[id]; changed = true; } for (const m of state.spyMissions.filter(x => x.status === "in_progress" && state.players.find(player => player.id === x.actorPlayerId)?.status !== "banned" && state.players.find(player => player.id === x.targetPlayerId)?.status !== "banned" && Date.parse(x.completesAt) <= now)) { const target = state.players.find(p => p.id === m.targetPlayerId); const intercepted = target && this.isCounterIntelActive(target.id, state) && ((hash(m.id) % 100) / 100 < (target.factionId === "veiled" ? 0.52 : 0.3)); if (intercepted) { m.status = "intercepted"; m.report = { revealedToTarget: true }; this.audit(m); changed = true; continue; } m.status = "success"; m.report = this.resolve(m, state); this.audit(m); changed = true; } return changed; }
  /** One audit row per resolved mission. `GAME-DESIGN.md` asks that sabotage and misinformation
   *  "luôn ghi audit event", and the `spy_launch.accepted` row the command path writes only proves a
   *  mission was *ordered*: the outcome lands minutes later inside `tick()`, with no command in
   *  flight to hang it off. The payload carries the report so an investigation into "my scout
   *  numbers were wrong" has something to compare against the city as it really was. */
  private audit(m: SpyMission): void { this.ledger.append({ eventType: `spy.${m.missionType}.${m.status}`, aggregateType: "espionage", aggregateId: m.id, actorPlayerId: m.actorPlayerId, payload: { targetPlayerId: m.targetPlayerId, accuracy: m.accuracy, completesAt: m.completesAt, report: m.report } }); }
  private isCounterIntelActive(playerId: string, state: GameState): boolean { return Boolean(state.counterIntelActive[playerId] && Date.parse(state.counterIntelActive[playerId]) > Date.now()); }
  /** The live lie standing between a scout and the truth, if there is one.
   *
   *  Missions are stored actor→target and this effect runs the other way: the lie A planted *on* B
   *  is what distorts what B's scouts read about *A*. Both sides of the pair have to match, or A's
   *  lie would fog every scout in the kingdom instead of the one player it was aimed at.
   *
   *  Expiry is compared against the scout's own `completesAt`, not the wall clock: the report is
   *  written for the moment the scout was due, so a tick that ran late — or a process that was down
   *  over the boundary — cannot decide whether the lie was still standing. */
  private misinformationAgainst(scout: SpyMission, state: GameState): SpyMission | undefined {
    return state.spyMissions.find(m => m.missionType === "misinformation" && m.status === "success"
      && m.actorPlayerId === scout.targetPlayerId && m.targetPlayerId === scout.actorPlayerId
      && Date.parse((m.report as MisinformationReport | undefined)?.plantedUntil ?? "") > Date.parse(scout.completesAt));
  }
  private resolve(m: SpyMission, state: GameState): unknown {
    // Misinformation touches nothing of the target's, so it resolves before the target-city lookup
    // the other three missions need. The expiry is derived from the mission's own schedule rather
    // than from `Date.now()`, which is what makes the effect window deterministic: a tick that fires
    // four seconds late must not hand out four extra seconds of lying.
    if (m.missionType === "misinformation") return { plantedUntil: new Date(Date.parse(m.completesAt) + misinformationEffectSeconds * 1000).toISOString() } satisfies MisinformationReport;
    const city = state.cities.find(c => c.playerId === m.targetPlayerId);
    if (!city) return {};
    if (m.missionType === "scout") {
      // With a lie standing, one signed factor replaces the fidelity term on every number in the
      // report, so the three readings stay consistent with each other: a target who saw inflated
      // resources next to honest army strength would know exactly which half to trust.
      const lie = this.misinformationAgainst(m, state);
      const skew = lie ? misinformationFactor(lie) : 0.8 + m.accuracy * 0.2;
      const resources = Object.fromEntries(Object.entries(city.resources).map(([key, value]) => [key, Math.max(0, Math.round(value * skew))]));
      // Building levels were handed out as a live reference to the real city, so an old report
      // silently rewrote itself as the city built on. It is copied now, distorted or not.
      const buildings = Object.fromEntries(Object.entries(city.buildings).map(([key, value]) => [key, lie ? Math.max(0, Math.round(value * skew)) : value]));
      // Positions stay true: anyone watching the map sees where an army is, so faking coordinates
      // would be a lie the game contradicts on screen a second later.
      const armies = state.armies.filter(a => a.ownerPlayerId === m.targetPlayerId).map(a => ({ id: a.id, x: a.x, y: a.y, strength: Math.max(0, Math.round(a.strength * (lie ? skew : m.accuracy))) }));
      if (lie) this.ledger.append({ eventType: "spy.misinformation.consumed", aggregateType: "espionage", aggregateId: lie.id, actorPlayerId: lie.actorPlayerId, payload: { scoutMissionId: m.id, scoutPlayerId: m.actorPlayerId, factor: skew, plantedUntil: (lie.report as MisinformationReport).plantedUntil } });
      return { resources, buildings, armies };
    }
    if (m.missionType === "sabotage") {
      const keys = Object.keys(city.buildings).filter(key => city.buildings[key] > 0);
      const key = keys.length ? keys[hash(m.id) % keys.length] : undefined;
      if (key) city.buildings[key] = Math.max(0, city.buildings[key] - 1);
      for (const army of state.armies.filter(a => a.ownerPlayerId === m.targetPlayerId)) army.supply = Math.max(0, army.supply - 30);
      return { building: key, supplyDamaged: true };
    }
    const stolen: Partial<Resources> = {};
    for (const key of ["wood", "stone", "iron"] as const) {
      const amount = Math.min(100, Math.floor(city.resources[key] * m.accuracy));
      city.resources[key] -= amount;
      stolen[key] = amount;
    }
    const source = state.cities.find(c => c.playerId === m.actorPlayerId);
    if (source) for (const key of ["wood", "stone", "iron"] as const) source.resources[key] += stolen[key] ?? 0;
    return { stolen };
  }
}

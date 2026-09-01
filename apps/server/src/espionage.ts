import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { spyMissionConfig, type SpyMission, type SpyMissionType, type Resources } from "@kingdoms/shared";
import type { GameState, Player } from "./types.js";

const emptyCost = (iron: number): Resources => ({ food: 0, wood: 0, stone: 0, iron });
const hash = (value: string) => Array.from(value).reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 17);

export class EspionageRepository {
  private cooldowns = new Map<string, number>();
  constructor(private readonly pool?: Pool) {}
  capture(): Array<[string, number]> { return [...this.cooldowns]; }
  restore(cooldowns: Array<[string, number]>): void { this.cooldowns = new Map(cooldowns); }
  resetForSeason(): void { this.cooldowns.clear(); }
  seed(state: GameState): void { state.spyMissions ??= []; state.counterIntelActive ??= {}; }
  setPlayerFrozen(playerId: string, frozen: boolean, deltaMs: number, state: GameState): void { if (frozen || deltaMs <= 0) return; for (const mission of state.spyMissions.filter(item => item.status === "in_progress" && (item.actorPlayerId === playerId || item.targetPlayerId === playerId))) mission.completesAt = new Date(Date.parse(mission.completesAt) + deltaMs).toISOString(); if (state.counterIntelActive[playerId]) state.counterIntelActive[playerId] = new Date(Date.parse(state.counterIntelActive[playerId]) + deltaMs).toISOString(); for (const [key, availableAt] of this.cooldowns) if (key.startsWith(`${playerId}:`)) this.cooldowns.set(key, availableAt + deltaMs); }
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
  launchMission(commandId: string, targetPlayerId: string, missionType: Exclude<SpyMissionType, "counter_intel">, playerId: string, state: GameState): SpyMission { if (state.processedCommands.includes(commandId)) throw new Error("already_processed"); const actor = state.players.find(p => p.id === playerId); const target = state.players.find(p => p.id === targetPlayerId); if (!actor || !target || actor.id === target.id) throw new Error("INVALID_TARGET"); if (actor.status === "banned") throw new Error("ACCOUNT_BANNED"); if (target.status === "banned") throw new Error("TARGET_FROZEN"); const cfg = spyMissionConfig[missionType]; const cooldownKey = `${playerId}:${missionType}`; if ((this.cooldowns.get(cooldownKey) ?? 0) > Date.now()) throw new Error("SPY_COOLDOWN"); const city = state.cities.find(c => c.playerId === playerId); if (!city) throw new Error("CITY_ACCESS_DENIED"); const veiled = actor.factionId === "veiled"; const cost = emptyCost(Math.floor(cfg.baseCost * (veiled ? 0.8 : 1))); if (city.resources.iron < cost.iron) throw new Error("INSUFFICIENT_RESOURCES"); city.resources.iron -= cost.iron; const now = Date.now(); const accuracy = Math.min(1, cfg.baseAccuracy * (veiled ? 1.2 : 1)); const mission: SpyMission = { id: randomUUID(), kingdomId: state.kingdom.id, actorPlayerId: playerId, targetPlayerId, missionType, status: "in_progress", accuracy, cost, startedAt: new Date(now).toISOString(), completesAt: new Date(now + cfg.durationSeconds * 1000).toISOString() }; state.spyMissions.push(mission); state.processedCommands.push(commandId); this.cooldowns.set(cooldownKey, now + cfg.cooldownSeconds * 1000 * (veiled ? 0.85 : 1)); return mission; }
  activateCounterIntel(commandId: string, playerId: string, state: GameState): string { if (state.processedCommands.includes(commandId)) return "already_processed"; const city = state.cities.find(c => c.playerId === playerId); const player = state.players.find(p => p.id === playerId); if (!city || !player) throw new Error("CITY_ACCESS_DENIED"); if (player.status === "banned") throw new Error("ACCOUNT_BANNED"); const cfg = spyMissionConfig.counter_intel; const cooldownKey = `${playerId}:counter_intel`; if ((this.cooldowns.get(cooldownKey) ?? 0) > Date.now()) throw new Error("SPY_COOLDOWN"); const veiled = player.factionId === "veiled"; const cost = Math.floor(cfg.baseCost * (veiled ? 0.8 : 1)); if (city.resources.iron < cost) throw new Error("INSUFFICIENT_RESOURCES"); city.resources.iron -= cost; const now = Date.now(); state.counterIntelActive[playerId] = new Date(now + 30 * 60 * 1000).toISOString(); this.cooldowns.set(cooldownKey, now + cfg.cooldownSeconds * 1000 * (veiled ? 0.85 : 1)); state.processedCommands.push(commandId); return "accepted"; }
  tick(state: GameState): boolean { let changed = false; const now = Date.now(); for (const [id, expires] of Object.entries(state.counterIntelActive)) if (state.players.find(player => player.id === id)?.status !== "banned" && Date.parse(expires) <= now) { delete state.counterIntelActive[id]; changed = true; } for (const m of state.spyMissions.filter(x => x.status === "in_progress" && state.players.find(player => player.id === x.actorPlayerId)?.status !== "banned" && state.players.find(player => player.id === x.targetPlayerId)?.status !== "banned" && Date.parse(x.completesAt) <= now)) { const target = state.players.find(p => p.id === m.targetPlayerId); const intercepted = target && this.isCounterIntelActive(target.id, state) && ((hash(m.id) % 100) / 100 < (target.factionId === "veiled" ? 0.52 : 0.3)); if (intercepted) { m.status = "intercepted"; m.report = { revealedToTarget: true }; changed = true; continue; } m.status = "success"; m.report = this.resolve(m, state); changed = true; } return changed; }
  private isCounterIntelActive(playerId: string, state: GameState): boolean { return Boolean(state.counterIntelActive[playerId] && Date.parse(state.counterIntelActive[playerId]) > Date.now()); }
  private resolve(m: SpyMission, state: GameState): unknown {
    const city = state.cities.find(c => c.playerId === m.targetPlayerId);
    if (!city) return {};
    if (m.missionType === "scout") {
      const resources = Object.fromEntries(Object.entries(city.resources).map(([key, value]) => [key, Math.max(0, Math.round(value * (0.8 + m.accuracy * 0.2)))]));
      const armies = state.armies.filter(a => a.ownerPlayerId === m.targetPlayerId).map(a => ({ id: a.id, x: a.x, y: a.y, strength: Math.round(a.strength * m.accuracy) }));
      return { resources, buildings: city.buildings, armies };
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

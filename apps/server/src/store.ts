import { Pool } from "pg";
import { factions, overallScore, militaryScore, diplomacyScore, type FactionId, type Scores } from "@kingdoms/shared";
import { randomUUID } from "node:crypto";
import type { CityState, GameState, Player } from "./types.js";
import { config } from "./config.js";
import { LogisticsRepository } from "./logistics.js";
import { EventLedger } from "./event-ledger.js";
import { CombatRepository } from "./combat.js";
import { DiplomacyRepository } from "./diplomacy.js";

const buildingCosts: Record<string, { wood: number; stone: number; iron: number; food: number; seconds: number }> = {
  town_hall: { wood: 100, stone: 50, iron: 0, food: 0, seconds: 10 }, warehouse: { wood: 80, stone: 25, iron: 0, food: 0, seconds: 8 }, road_depot: { wood: 120, stone: 80, iron: 20, food: 0, seconds: 12 }, barracks: { wood: 150, stone: 100, iron: 50, food: 0, seconds: 15 }
};
function newSeason(): GameState["season"] { const now = Date.now(); return { id: randomUUID(), status: "ACTIVE", startsAt: new Date(now).toISOString(), endsAt: new Date(now + config.seasonDurationMs).toISOString() }; }
function makeCity(playerId: string, name: string, x: number, y: number): CityState { return { id: randomUUID(), playerId, name, x, y, resources: { food: 0, wood: 500, stone: 500, iron: 500 }, buildings: { town_hall: 1 }, queues: [], starterGranted: true }; }
export function createSeedState(): GameState {
  const kingdomId = randomUUID(); const first: Player = { id: randomUUID(), displayName: "Lan", factionId: "meridian", kingdomId }; const second: Player = { id: randomUUID(), displayName: "Minh", factionId: "bastion", kingdomId };
  const firstCity = makeCity(first.id, "Meridian Outpost", 8, 8); const secondCity = makeCity(second.id, "Bastion Gate", 13, 11);
  return { kingdom: { id: kingdomId, name: "Meridian Kingdom" }, season: newSeason(), players: [first, second], cities: [firstCity, secondCity], caravans: [], armies: [{ id: randomUUID(), ownerPlayerId: first.id, x: 9, y: 8, unitType: "infantry", strength: 100, morale: 100, formation: "line", supply: 100 }, { id: randomUUID(), ownerPlayerId: second.id, x: 14, y: 11, unitType: "archer", strength: 100, morale: 100, formation: "line", supply: 100 }], heroes: [], scores: {}, seasonHistory: [], legacyRecords: [], processedCommands: [], battleReports: [], terrainMap: {}, militaryThroughput: {}, alliances: [], treaties: [], diplomacyThroughput: {} };
}
export class GameStore {
  private state: GameState = createSeedState(); private readonly pool?: Pool; readonly logistics: LogisticsRepository;
  readonly ledger: EventLedger;
  readonly combat: CombatRepository;
  readonly diplomacy: DiplomacyRepository;
  constructor() { this.pool = config.databaseUrl ? new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 1500 }) : undefined; this.logistics = new LogisticsRepository(this.pool); this.combat = new CombatRepository(this.pool); this.diplomacy = new DiplomacyRepository(this.pool); this.ledger = new EventLedger(this.pool); this.logistics.seed(this.state); this.combat.seed(this.state); this.diplomacy.seed(this.state); }
  async load(): Promise<void> { if (this.pool) { try { const result = await this.pool.query<{ state: GameState }>("SELECT state FROM game_state WHERE state_key = $1", ["kingdom"]); if (result.rows[0]?.state) this.state = { ...result.rows[0].state, armies: result.rows[0].state.armies ?? [], heroes: result.rows[0].state.heroes ?? [], caravans: [], battleReports: result.rows[0].state.battleReports ?? [], terrainMap: result.rows[0].state.terrainMap ?? {}, militaryThroughput: result.rows[0].state.militaryThroughput ?? {}, alliances: result.rows[0].state.alliances ?? [], treaties: result.rows[0].state.treaties ?? [], diplomacyThroughput: result.rows[0].state.diplomacyThroughput ?? {} }; } catch (error) { console.warn("database load skipped", error instanceof Error ? error.message : error); } } this.logistics.seed(this.state); this.combat.seed(this.state); await this.logistics.load(this.state); await this.combat.load(this.state); await this.diplomacy.load(this.state); await this.ledger.load(); }
  async save(): Promise<void> {
    this.logistics.syncDepots(this.state);
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.logistics.persist(client, this.state);
      await this.combat.persist(client, this.state);
      await this.ledger.persist(client);
      await client.query("INSERT INTO game_state (state_key, state) VALUES ($1, $2) ON CONFLICT (state_key) DO UPDATE SET state = EXCLUDED.state, updated_at = now()", ["kingdom", JSON.stringify(this.state)]);
      await client.query("COMMIT");
      this.ledger.markPersisted();
    } catch (error) { await client.query("ROLLBACK"); console.warn("database save skipped", error instanceof Error ? error.message : error); } finally { client.release(); }
  }
  get snapshot(): GameState { return this.state; } findPlayer(id: string): Player | undefined { return this.state.players.find(player => player.id === id); } findCity(id: string): CityState | undefined { return this.state.cities.find(city => city.id === id); }
  addDevPlayer(displayName: string, factionId: FactionId): Player { const existing = this.state.players.find(player => player.displayName.toLowerCase() === displayName.toLowerCase()); if (existing) return existing; const player: Player = { id: randomUUID(), displayName, factionId, kingdomId: this.state.kingdom.id }; const slot = this.state.players.length; this.state.players.push(player); this.state.cities.push(makeCity(player.id, `${factions[factionId].name} City`, 5 + slot * 4, 5 + slot * 3)); return player; }
  startBuild(playerId: string, commandId: string, cityId: string, buildingId: string, queueType: "build" | "research"): string { if (this.state.processedCommands.includes(commandId)) return "already_processed"; const city = this.findCity(cityId); if (!city || city.playerId !== playerId) throw new Error("CITY_ACCESS_DENIED"); const limit = queueType === "build" ? 2 : 1; if (city.queues.filter(queue => queue.type === queueType).length >= limit) throw new Error("QUEUE_LIMIT_REACHED"); const cost = buildingCosts[buildingId]; if (!cost) throw new Error("UNKNOWN_BUILDING"); for (const key of ["food", "wood", "stone", "iron"] as const) if (city.resources[key] < cost[key]) throw new Error("INSUFFICIENT_RESOURCES"); for (const key of ["food", "wood", "stone", "iron"] as const) city.resources[key] -= cost[key]; const now = Date.now(); city.queues.push({ id: randomUUID(), type: queueType, buildingId, targetLevel: (city.buildings[buildingId] ?? 0) + 1, startedAt: new Date(now).toISOString(), completesAt: new Date(now + cost.seconds * 1000).toISOString() }); this.state.processedCommands.push(commandId); return "accepted"; }
  tick(): boolean { let changed = false; for (const city of this.state.cities) for (const queue of city.queues.filter(item => Date.parse(item.completesAt) <= Date.now())) { city.buildings[queue.buildingId] = queue.targetLevel; city.queues = city.queues.filter(item => item.id !== queue.id); changed = true; } for (const army of this.state.armies) { const supply = Math.max(0, army.supply - 1); army.supply = supply; if (supply < 25 && army.strength > 1) { army.strength -= 1; changed = true; } } this.logistics.syncDepots(this.state); const logisticsChanged = this.logistics.tick(this.state); const combatChanged = this.combat.tick(this.state); const diplomacyChanged = this.diplomacy.tick(this.state); changed = logisticsChanged || combatChanged || diplomacyChanged || changed; if (logisticsChanged) this.ledger.append({ eventType: "logistics.tick", aggregateType: "kingdom", aggregateId: this.state.kingdom.id, payload: { caravans: this.logistics.caravans().map(caravan => ({ id: caravan.id, status: caravan.status, progress: caravan.progress, ambushSeed: caravan.ambushSeed })) } }); this.recalculateScores(); return changed; }
  recalculateScores(): void { for (const player of this.state.players) { const delivered = this.logistics.snapshot().throughput[player.id]; const stats = this.state.militaryThroughput[player.id] ?? { victories: 0, defeats: 0, draws: 0, strengthDestroyed: 0, strengthLost: 0, tilesControlled: 0, successfulDefenses: 0 }; const economy = Math.min(1000, Math.floor(((delivered?.wood ?? 0) + (delivered?.stone ?? 0) + (delivered?.iron ?? 0) * 2) / 2)); const military = militaryScore(stats); const scores = { military, economy, diplomacy: diplomacyScore(this.diplomacy.getStats(player.id, this.state)), overall: 0 } satisfies Scores; scores.overall = overallScore(scores); this.state.scores[player.id] = scores; } }
  finalizeIfDue(): boolean { if (this.state.season.status !== "ACTIVE" || Date.parse(this.state.season.endsAt) > Date.now()) return false; const closed = this.state.season; closed.status = "FINALIZING"; this.recalculateScores(); const rankings = this.state.players.map(player => ({ playerId: player.id, scores: this.state.scores[player.id], overall: this.state.scores[player.id].overall })).sort((a, b) => b.overall - a.overall || a.playerId.localeCompare(b.playerId)).map((item, index) => ({ ...item, rank: index + 1 })); this.state.seasonHistory.push({ seasonId: closed.id, rankings, closedAt: new Date().toISOString() }); this.state.legacyRecords.push(...rankings.map(ranking => ({ id: randomUUID(), ownerId: ranking.playerId, seasonId: closed.id, recordType: "season_result", payload: ranking }))); this.state.season = newSeason(); return true; }
}






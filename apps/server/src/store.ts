import { Pool } from "pg";
import { factions, overallScore, type FactionId, type Scores } from "@kingdoms/shared";
import { randomUUID } from "node:crypto";
import type { CityState, GameState, Player } from "./types.js";
import { config } from "./config.js";

const buildingCosts: Record<string, { wood: number; stone: number; iron: number; food: number; seconds: number }> = {
  town_hall: { wood: 100, stone: 50, iron: 0, food: 0, seconds: 10 },
  warehouse: { wood: 80, stone: 25, iron: 0, food: 0, seconds: 8 },
  road_depot: { wood: 120, stone: 80, iron: 20, food: 0, seconds: 12 }
};

function newSeason(): GameState["season"] {
  const now = Date.now();
  return { id: randomUUID(), status: "ACTIVE", startsAt: new Date(now).toISOString(), endsAt: new Date(now + config.seasonDurationMs).toISOString() };
}

function makeCity(playerId: string, name: string, x: number, y: number): CityState {
  return { id: randomUUID(), playerId, name, x, y, resources: { food: 500, wood: 500, stone: 250, iron: 100 }, buildings: { town_hall: 1 }, queues: [] };
}

export function createSeedState(): GameState {
  const kingdomId = randomUUID();
  const first: Player = { id: randomUUID(), displayName: "Lan", factionId: "meridian", kingdomId };
  const second: Player = { id: randomUUID(), displayName: "Minh", factionId: "bastion", kingdomId };
  const firstCity = makeCity(first.id, "Meridian Outpost", 8, 8);
  const secondCity = makeCity(second.id, "Bastion Gate", 13, 11);
  return {
    kingdom: { id: kingdomId, name: "Meridian Kingdom" }, season: newSeason(), players: [first, second], cities: [firstCity, secondCity],
    caravans: [{ id: randomUUID(), ownerPlayerId: first.id, sourceCityId: firstCity.id, destinationCityId: secondCity.id, progress: 0, status: "moving" }],
    armies: [{ id: randomUUID(), ownerPlayerId: first.id, x: 9, y: 8, unitType: "infantry", strength: 100 }, { id: randomUUID(), ownerPlayerId: second.id, x: 14, y: 11, unitType: "archer", strength: 100 }],
    heroes: [{ id: randomUUID(), ownerPlayerId: first.id, name: "Ari, Người Dẫn Đường", x: 8, y: 7 }, { id: randomUUID(), ownerPlayerId: second.id, name: "Vân, Hộ Thành", x: 13, y: 10 }],
    scores: {}, seasonHistory: [], legacyRecords: [], processedCommands: []
  };
}

export class GameStore {
  private state: GameState = createSeedState();
  private readonly pool: Pool | undefined;

  constructor() {
    this.pool = config.databaseUrl ? new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 1500 }) : undefined;
  }

  async load(): Promise<void> {
    if (!this.pool) return;
    try {
      const result = await this.pool.query<{ state: GameState }>("SELECT state FROM game_state WHERE state_key = $1", ["kingdom"]);
      if (result.rows[0]?.state) this.state = { ...result.rows[0].state, armies: result.rows[0].state.armies ?? [], heroes: result.rows[0].state.heroes ?? [] };
    } catch (error) {
      console.warn("database load skipped", error instanceof Error ? error.message : error);
    }
  }

  async save(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query("INSERT INTO game_state (state_key, state) VALUES ($1, $2) ON CONFLICT (state_key) DO UPDATE SET state = EXCLUDED.state, updated_at = now()", ["kingdom", JSON.stringify(this.state)]);
    } catch (error) {
      console.warn("database save skipped", error instanceof Error ? error.message : error);
    }
  }

  get snapshot(): GameState { return this.state; }

  findPlayer(playerId: string): Player | undefined { return this.state.players.find((player) => player.id === playerId); }
  findCity(cityId: string): CityState | undefined { return this.state.cities.find((city) => city.id === cityId); }

  addDevPlayer(displayName: string, factionId: FactionId): Player {
    const existing = this.state.players.find((player) => player.displayName.toLowerCase() === displayName.toLowerCase());
    if (existing) return existing;
    const player: Player = { id: randomUUID(), displayName, factionId, kingdomId: this.state.kingdom.id };
    const slot = this.state.players.length;
    this.state.players.push(player);
    this.state.cities.push(makeCity(player.id, `${factions[factionId].name} City`, 5 + slot * 4, 5 + slot * 3));
    return player;
  }

  startBuild(playerId: string, commandId: string, cityId: string, buildingId: string, queueType: "build" | "research"): string {
    if (this.state.season.status !== "ACTIVE") throw new Error("SEASON_NOT_ACTIVE");
    if (this.state.processedCommands.includes(commandId)) return "already_processed";
    const city = this.findCity(cityId);
    if (!city || city.playerId !== playerId) throw new Error("CITY_ACCESS_DENIED");
    const limit = queueType === "build" ? 2 : 1;
    if (city.queues.filter((queue) => queue.type === queueType).length >= limit) throw new Error("QUEUE_LIMIT_REACHED");
    const cost = buildingCosts[buildingId];
    if (!cost) throw new Error("UNKNOWN_BUILDING");
    if (Object.entries(cost).some(([key, value]) => key !== "seconds" && city.resources[key as keyof typeof city.resources] < value)) throw new Error("INSUFFICIENT_RESOURCES");
    for (const key of ["food", "wood", "stone", "iron"] as const) city.resources[key] -= cost[key];
    const targetLevel = (city.buildings[buildingId] ?? 0) + 1;
    const now = Date.now();
    city.queues.push({ id: randomUUID(), type: queueType, buildingId, targetLevel, startedAt: new Date(now).toISOString(), completesAt: new Date(now + cost.seconds * 1000).toISOString() });
    this.state.processedCommands.push(commandId);
    if (this.state.processedCommands.length > 1000) this.state.processedCommands.splice(0, 500);
    return "accepted";
  }

  tick(): boolean {
    let changed = false;
    for (const city of this.state.cities) {
      const player = this.findPlayer(city.playerId);
      const multiplier = player?.factionId === "meridian" ? 1.25 : 1;
      city.resources.food += Math.floor(5 * multiplier); city.resources.wood += Math.floor(5 * multiplier); city.resources.stone += Math.floor(3 * multiplier); city.resources.iron += Math.floor(1 * multiplier);
      const completed = city.queues.filter((queue) => Date.parse(queue.completesAt) <= Date.now());
      for (const queue of completed) { city.buildings[queue.buildingId] = queue.targetLevel; city.queues = city.queues.filter((item) => item.id !== queue.id); changed = true; }
    }
    for (const caravan of this.state.caravans.filter((item) => item.status === "moving")) { caravan.progress = Math.min(1, caravan.progress + 0.01); if (caravan.progress >= 1) caravan.status = "delivered"; changed = true; }
    this.recalculateScores();
    return changed;
  }

  recalculateScores(): void {
    for (const player of this.state.players) {
      const cities = this.state.cities.filter((city) => city.playerId === player.id);
      const economy = Math.min(1000, Math.floor(cities.reduce((total, city) => total + Object.values(city.resources).reduce((sum, amount) => sum + amount, 0), 0) / 20));
      const scores = { military: 0, economy, diplomacy: 0, overall: 0 } satisfies Scores;
      scores.overall = overallScore(scores);
      this.state.scores[player.id] = scores;
    }
  }

  finalizeIfDue(): boolean {
    if (this.state.season.status !== "ACTIVE" || Date.parse(this.state.season.endsAt) > Date.now()) return false;
    const closedSeason = this.state.season;
    closedSeason.status = "FINALIZING";
    this.recalculateScores();
    const rankings = this.state.players.map((player) => ({ playerId: player.id, scores: this.state.scores[player.id], overall: this.state.scores[player.id].overall })).sort((left, right) => right.overall - left.overall || right.scores.military - left.scores.military || right.scores.economy - left.scores.economy || right.scores.diplomacy - left.scores.diplomacy || left.playerId.localeCompare(right.playerId)).map((item, index) => ({ ...item, rank: index + 1 }));
    this.state.seasonHistory.push({ seasonId: closedSeason.id, rankings, closedAt: new Date().toISOString() });
    for (const ranking of rankings) this.state.legacyRecords.push({ id: randomUUID(), ownerId: ranking.playerId, seasonId: closedSeason.id, recordType: "season_result", payload: ranking });
    closedSeason.status = "CLOSED";
    this.state.season = newSeason();
    return true;
  }
}

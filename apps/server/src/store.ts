import { Pool, type PoolClient } from "pg";
import { anchors as authoredAnchors, buildingIds, cityGridSize, cityRotations, buildingDimensions, buildingOccupiedTiles, isPlacementWithinBounds, validatePlacements, migrateCityLayoutV1toV2, factions, gameRules, overallScore, militaryScore, diplomacyScore, regionAt, scaleWorldCoordinate, cosmeticCatalog, cosmeticRewards, initialCommanderCatalog, emptyTroopCounts, type BuildingId, type BuildingPlacement, type CityRotation, type FactionId, type Scores, type CosmeticSlot, type PlayerHub, type EquippedCosmetics, type Commander } from "@kingdoms/shared";
import { createHash, randomUUID } from "node:crypto";
import type { CityState, CosmeticAccount, GameState, Player } from "./types.js";
import { config } from "./config.js";
import { LogisticsRepository } from "./logistics.js";
import { EventLedger } from "./event-ledger.js";
import { battleReportMemoryLimit, CombatRepository } from "./combat.js";
import { controlledTilesFromStates, ensureRegionStates, tickTerritory } from "./territory.js";
import { DiplomacyRepository } from "./diplomacy.js";
import { EspionageRepository } from "./espionage.js";
import { WorldEventEngine } from "./world-events.js";
import { RaiderEngine } from "./raiders.js";
import { OnboardingRepository } from "./onboarding.js";
import { DailyQuestRepository } from "./daily-quests.js";
import { refreshExploration } from "./exploration.js";
import { worldAssetId } from "@kingdoms/shared";
import { CommandRegistry } from "./command-registry.js";
import { buildLegacyRecords, hardReset, reputationCosmetic, seasonResetTemplate } from "./season-reset.js";
import { applyCompositionLosses, normalizeNpcArmies } from "./army-model.js";
import { buildSeasonAnalytics } from "./analytics.js";
import { ArmyManagementRepository } from "./army-management.js";
import { ProgressionRepository } from "./progression.js";
import { OperationRepository } from "./operations.js";
import { RivalEngine } from "./rival-ai.js";

// Prices are `gameRules.buildings` — the same table the client reads to draw the
// build menu — reshaped into the flat form `startBuild` charges from. This used to
// be a second literal holding the same four rows, which meant a price change in
// shared silently left the server charging the old cost while the UI promised the
// new one. Deriving it makes that drift unrepresentable; `store.test.ts` asserts
// the two still agree.
const buildingCosts: Record<string, { wood: number; stone: number; iron: number; food: number; seconds: number }> =
  Object.fromEntries(Object.values(gameRules.buildings).map(building => [building.id, { ...building.cost, seconds: building.durationSeconds }]));
class IncompatibleWorldError extends Error {}
function newSeason(): GameState["season"] { const now = Date.now(); return { id: randomUUID(), worldId: worldAssetId, status: "ACTIVE", startsAt: new Date(now).toISOString(), endsAt: new Date(now + config.seasonDurationMs).toISOString() }; }
const emptyEquipped = (): EquippedCosmetics => ({ avatar_frame: null, flag_color: null, nameplate: null });
const emptyCosmeticAccount = (): CosmeticAccount => ({ badges: 0, owned: [], equipped: emptyEquipped(), claimedRewardIds: [] });
const townHallPlot = (size: number = 12): BuildingPlacement => {
  const center = Math.floor((size - 3) / 2);
  return { buildingId: "town_hall", x: center, y: center, rotation: 0 };
};

const seasonGateBypasses = new Set(["onboarding_ack", "cosmetics_claim", "cosmetics_purchase", "cosmetics_equip"]);
const assertGameplaySeason = (state: GameState, aggregateType: string): void => {
  if (state.season.status !== "ACTIVE" && !seasonGateBypasses.has(aggregateType)) throw new Error("SEASON_NOT_ACTIVE");
};
const sameRegionControl = (left: Record<string, string>, right: Record<string, string>): boolean => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (left[key] !== right[key]) return false;
  return true;
};

/** Repairs saves from before city interiors existed or v1 layouts, migrating
 * them to v2 deterministically, and ensures required buildings have valid footprints. */
function normalizeBuildingPlots(city: CityState): void {
  if (city.cityLayoutVersion !== 2) {
    city.buildingPlots = migrateCityLayoutV1toV2(city);
    city.cityLayoutVersion = 2;
    city.cityLayoutRevision = 0;
    return;
  }

  const size = cityGridSize(city.buildings?.town_hall ?? 1);
  const known = new Set<string>(buildingIds);
  const candidates = (city.buildingPlots ?? []).filter(plot =>
    known.has(plot.buildingId) &&
    cityRotations.includes(plot.rotation ?? 0) &&
    isPlacementWithinBounds({ ...plot, rotation: plot.rotation ?? 0 }, size)
  );

  const unique: BuildingPlacement[] = [];
  const occupiedTiles = new Set<string>();
  const usedBuildings = new Set<string>();

  for (const plot of candidates) {
    if (usedBuildings.has(plot.buildingId)) continue;
    const tiles = buildingOccupiedTiles(plot);
    if (tiles.some(t => occupiedTiles.has(`${t.x},${t.y}`))) continue;
    unique.push({ ...plot, rotation: plot.rotation ?? 0 });
    usedBuildings.add(plot.buildingId);
    for (const t of tiles) occupiedTiles.add(`${t.x},${t.y}`);
  }
  city.buildingPlots = unique;

  const required = new Set<BuildingId>();
  for (const buildingId of buildingIds) {
    if ((city.buildings[buildingId] ?? 0) > 0) required.add(buildingId);
  }
  for (const queue of city.queues) {
    if (known.has(queue.buildingId)) required.add(queue.buildingId as BuildingId);
  }
  if (!required.has("town_hall")) required.add("town_hall");

  for (const buildingId of required) {
    if (usedBuildings.has(buildingId)) continue;
    const queued = city.queues.find(q => q.buildingId === buildingId && q.plotX !== undefined && q.plotY !== undefined);
    const requestedRot = (queued?.plotRotation ?? 0) as CityRotation;
    const requested = queued ? { x: queued.plotX!, y: queued.plotY!, rotation: requestedRot } : undefined;
    const { width, height } = buildingDimensions(buildingId, requested?.rotation ?? 0);

    const canFit = (x: number, y: number, rot: CityRotation) => {
      if (!isPlacementWithinBounds({ buildingId, x, y, rotation: rot }, size)) return false;
      const tiles = buildingOccupiedTiles({ buildingId, x, y, rotation: rot });
      return tiles.every(t => !occupiedTiles.has(`${t.x},${t.y}`));
    };

    if (requested && canFit(requested.x, requested.y, requested.rotation)) {
      const placement: BuildingPlacement = { buildingId, ...requested };
      city.buildingPlots.push(placement);
      usedBuildings.add(buildingId);
      for (const t of buildingOccupiedTiles(placement)) occupiedTiles.add(`${t.x},${t.y}`);
      continue;
    }

    const center = Math.floor((size - width) / 2);
    let bestPlacement: BuildingPlacement | undefined;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let y = 0; y <= size - height; y++) {
      for (let x = 0; x <= size - width; x++) {
        if (canFit(x, y, 0)) {
          const dist = Math.abs(x - center) + Math.abs(y - center);
          if (dist < bestDist) {
            bestDist = dist;
            bestPlacement = { buildingId, x, y, rotation: 0 };
          }
        }
      }
    }
    if (bestPlacement) {
      city.buildingPlots.push(bestPlacement);
      usedBuildings.add(buildingId);
      for (const t of buildingOccupiedTiles(bestPlacement)) occupiedTiles.add(`${t.x},${t.y}`);
    }
  }
}

function normalizeLegacyArmies(state: GameState): void {
  for (const army of state.armies) {
    if (army.ownerType !== "player" || !army.ownerPlayerId || (army.composition && army.commanderId)) continue;
    const home = state.cities
      .filter(city => city.playerId === army.ownerPlayerId)
      .sort((left, right) => Math.abs(left.x - army.x) + Math.abs(left.y - army.y) - Math.abs(right.x - army.x) - Math.abs(right.y - army.y))[0];
    const commanderId = army.commanderId ?? `legacy-commander-${army.id}`;
    const commander = state.commanders.find(item => item.id === commanderId);
    if (!commander) state.commanders.push({ id: commanderId, ownerPlayerId: army.ownerPlayerId, name: "Chỉ huy chuyển đổi", specialty: "logistics", level: 10, xp: 0, assignedArmyId: army.id, neutral: true });
    else commander.assignedArmyId = army.id;
    const troopType = army.unitType === "archer" ? "archers" : army.unitType === "cavalry" ? "cavalry" : "shield_infantry";
    army.commanderId = commanderId;
    army.composition = army.strength > 0 ? { frontline: { id: `${army.id}-legacy-frontline`, troopType, position: "frontline", count: army.strength }, backline: null, flank: null } : undefined;
    army.stance = "balanced";
    army.wounded ??= emptyTroopCounts();
    if (home) army.homeCityId ??= home.id;
  }
}

function makeCity(playerId: string, name: string, x: number, y: number): CityState {
  return {
    id: randomUUID(),
    playerId,
    name,
    x,
    y,
    resources: { food: 0, wood: 500, stone: 500, iron: 500 },
    buildings: { town_hall: 1 },
    cityLayoutVersion: 2,
    cityLayoutRevision: 0,
    buildingPlots: [townHallPlot(12)],
    queues: [],
    productionAt: new Date().toISOString(),
    starterGranted: true,
  };
}

/** Where the two seeded cities stand. Legacy coordinates: the logistics and espionage tests measure
 *  distances between these and the inherited mines, so they are not free to move. */
export const seedCityTiles = [
  { x: scaleWorldCoordinate(8), y: scaleWorldCoordinate(8) },
  { x: scaleWorldCoordinate(13), y: scaleWorldCoordinate(11) },
] as const;
type Tile = { x: number; y: number };
/** A port or a mine as placement sees it: a tile, plus what it yields when it is a mine. */
type PlacementAnchor = Tile & { resourceType?: "wood" | "stone" | "iron" };
const harvestableTypes = ["wood", "stone", "iron"] as const;

/** The placement window, split by province and row-major inside each one. Depends only on
 *  `gameRules.cityPlacement` and the authored map, so it is built once. Provinces on the edge of
 *  the world hold fewer tiles than the interior ones — the two-tile margin eats into them. */
const provinceTiles = (() => {
  let cached: Array<{ code: string; tiles: Array<{ x: number; y: number }> }> | undefined;
  return () => {
    if (cached) return cached;
    const { minX, maxX, minY, maxY } = gameRules.cityPlacement;
    const byCode = new Map<string, Array<{ x: number; y: number }>>();
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const region = regionAt(x, y);
        if (!region) continue;
        const tiles = byCode.get(region.code) ?? [];
        tiles.push({ x, y });
        byCode.set(region.code, tiles);
      }
    }
    cached = [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, tiles]) => ({ code, tiles }));
    return cached;
  };
})();

// Deterministic placement inside the window `gameRules.cityPlacement` derives from the map size:
// free of cities and anchors, at least `minDistanceBetweenCities` Manhattan from another city,
// within `maxDistanceToHubOrNode` of a port or a mine, and with a mine of *every* resource type
// inside `logistics.harvestRange`. That last rule is new with the 36-wide world: buildings cost
// wood, stone and iron, and a province holds only two mines, so a site can now sit next to a quarry
// and still have no iron it can reach — a city that runs out after the starter package and has no
// local source at all. On the old 20-wide world all three mines were in reach of everywhere, so the
// rule could stay unwritten.
//
// Provinces are visited emptiest-first, ties by code, and only then is each one scanned row-major.
// So no province takes a second city while another still has none, and the sixteenth player is a
// neighbour of nobody. Plain row-major over the whole window was harmless on a 20-wide world where
// every legal tile was near one of four anchors anyway; on a 36-wide one it packs the first forty
// players into the north-west corner, which makes a load test measure one crowded corner instead
// of a world.
function nextCitySite(cities: readonly Tile[], anchors: readonly PlacementAnchor[]): Tile | undefined {
  const { minDistanceBetweenCities, maxDistanceToHubOrNode } = gameRules.cityPlacement;
  const manhattan = (a: Tile, b: Tile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const taken = new Set([...cities, ...anchors].map(tile => `${tile.x},${tile.y}`));
  const minesByType = harvestableTypes.map(type => anchors.filter(anchor => anchor.resourceType === type));
  const cityCounts = new Map<string, number>();
  for (const city of cities) {
    const code = regionAt(city.x, city.y)?.code;
    if (code) cityCounts.set(code, (cityCounts.get(code) ?? 0) + 1);
  }
  const provinces = [...provinceTiles()].sort((a, b) => (cityCounts.get(a.code) ?? 0) - (cityCounts.get(b.code) ?? 0) || a.code.localeCompare(b.code));
  for (const province of provinces) {
    for (const tile of province.tiles) {
      if (taken.has(`${tile.x},${tile.y}`)) continue;
      if (cities.some(city => manhattan(city, tile) < minDistanceBetweenCities)) continue;
      if (!anchors.some(anchor => manhattan(anchor, tile) <= maxDistanceToHubOrNode)) continue;
      if (!minesByType.every(mines => mines.some(mine => manhattan(mine, tile) <= gameRules.logistics.harvestRange))) continue;
      return tile;
    }
  }
  return undefined;
}

function cityPlacement(state: GameState, logistics: LogisticsRepository): Tile {
  const anchors = [...logistics.snapshot().marketHubs, ...logistics.snapshot().resourceNodes];
  const site = nextCitySite(state.cities, anchors);
  if (!site) throw new Error("KINGDOM_FULL");
  return site;
}

/** How many cities this kingdom holds before `KINGDOM_FULL` — the two seed cities plus every tile
 *  the greedy placement can still reach. Pure: it runs the same `nextCitySite` against the authored
 *  anchors instead of a live store, so `loadtest-seed` can reject an impossible `LOADTEST_USERS`
 *  before it writes its first row rather than dying half-seeded. */
export function citySiteCapacity(): number {
  const anchors: PlacementAnchor[] = authoredAnchors.map(anchor => ({ x: anchor.x, y: anchor.y, resourceType: anchor.kind === "node" ? anchor.resourceType : undefined }));
  const cities: Tile[] = seedCityTiles.map(tile => ({ ...tile }));
  for (;;) {
    const site = nextCitySite(cities, anchors);
    if (!site) return cities.length;
    cities.push(site);
  }
}
export function createSeedState(): GameState {
  const kingdomId = randomUUID(); const first: Player = { id: randomUUID(), displayName: "Lan", factionId: "meridian", kingdomId, crossSeasonReputation: 0 }; const second: Player = { id: randomUUID(), displayName: "Minh", factionId: "bastion", kingdomId, crossSeasonReputation: 0 };
  const firstCity = makeCity(first.id, "Meridian Outpost", seedCityTiles[0].x, seedCityTiles[0].y); const secondCity = makeCity(second.id, "Bastion Gate", seedCityTiles[1].x, seedCityTiles[1].y);
  const commanderFor = (player: Player, catalogIndex: number): Commander => ({ ...initialCommanderCatalog[catalogIndex]!, id: `${initialCommanderCatalog[catalogIndex]!.id}-${player.id}`, ownerPlayerId: player.id, level: 1, xp: 0, assignedArmyId: undefined });
  const firstCommander = commanderFor(first, 0); const secondCommander = commanderFor(second, 0);
  const firstArmyId = randomUUID(); const secondArmyId = randomUUID();
  firstCommander.assignedArmyId = firstArmyId;
  secondCommander.assignedArmyId = secondArmyId;
  return { kingdom: { id: kingdomId, name: "Meridian Kingdom" }, season: newSeason(), players: [first, second], cities: [firstCity, secondCity], caravans: [], commanders: [firstCommander, secondCommander], troopReserves: { [firstCity.id]: { cityId: firstCity.id, ownerPlayerId: first.id, available: emptyTroopCounts(), wounded: emptyTroopCounts() }, [secondCity.id]: { cityId: secondCity.id, ownerPlayerId: second.id, available: emptyTroopCounts(), wounded: emptyTroopCounts() } }, formationPresets: [], trainingQueues: {}, hospitalQueues: {}, technologyProgress: {}, researchQueues: {}, campaignProgress: {}, activeOperations: {}, armies: [{ id: firstArmyId, ownerType: "player", ownerPlayerId: first.id, x: firstCity.x, y: firstCity.y, homeCityId: firstCity.id, commanderId: firstCommander.id, composition: { frontline: { id: `${firstArmyId}-frontline`, troopType: "shield_infantry", position: "frontline", count: 100 }, backline: null, flank: null }, stance: "balanced", unitType: "infantry", strength: 100, morale: 100, formation: "line", supply: 100, lastSupplyAt: new Date().toISOString() }, { id: secondArmyId, ownerType: "player", ownerPlayerId: second.id, x: secondCity.x, y: secondCity.y, homeCityId: secondCity.id, commanderId: secondCommander.id, composition: { frontline: { id: `${secondArmyId}-frontline`, troopType: "archers", position: "frontline", count: 100 }, backline: null, flank: null }, stance: "balanced", unitType: "archer", strength: 100, morale: 100, formation: "line", supply: 100, lastSupplyAt: new Date().toISOString() }], heroes: [], scores: {}, seasonHistory: [], legacyRecords: [], battleReports: [], terrainMap: {}, explorationMasks: {}, militaryThroughput: {}, regionControl: {}, regionStates: {}, rivalIntents: [], regionControlRevision: 0, alliances: [], allianceVotes: [], treaties: [], diplomacyThroughput: {}, spyMissions: [], worldEvents: [], counterIntelActive: {}, seasonMetrics: { resourcesProduced: {} }, raiderSpawnState: { sequence: 0 }, logisticsCounters: { exports: {}, harvests: {} }, cosmeticAccounts: {}, dailyQuests: {}, activityCounters: { trainingBatches: {}, caravansDelivered: {}, campaignsCompleted: {} } };
}
export class GameStore {
  private state: GameState = createSeedState(); private readonly pool?: Pool; readonly logistics: LogisticsRepository;
  private writeQueue: Promise<void> = Promise.resolve();
  private tickReportBatch: ReturnType<CombatRepository["drainReports"]> = [];
  private tickCancelBatch: ReturnType<CombatRepository["drainCancellations"]> = [];
  readonly ledger: EventLedger;
  readonly combat: CombatRepository;
  readonly diplomacy: DiplomacyRepository;
  readonly espionage: EspionageRepository;
  readonly worldEvents: WorldEventEngine;
  readonly raiders: RaiderEngine;
  readonly onboarding: OnboardingRepository;
  readonly dailyQuests: DailyQuestRepository;
  readonly armyManagement: ArmyManagementRepository;
  readonly progression: ProgressionRepository;
  readonly operations: OperationRepository;
  readonly rivals: RivalEngine;
  // One bounded dedupe registry shared by every repository that claims a command id, in place of
  // three unbounded Sets that were copied twice per command for rollback.
  readonly commands: CommandRegistry;
  constructor() { this.pool = config.databaseUrl ? new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 1500 }) : undefined; this.commands = new CommandRegistry(); this.logistics = new LogisticsRepository(this.pool, this.commands); this.combat = new CombatRepository(this.pool, this.commands); this.armyManagement = new ArmyManagementRepository(this.commands); this.progression = new ProgressionRepository(this.combat, this.logistics, this.commands); this.operations = new OperationRepository(this.commands); this.rivals = new RivalEngine(); this.diplomacy = new DiplomacyRepository(this.pool, this.commands); this.ledger = new EventLedger(this.pool); this.espionage = new EspionageRepository(this.pool, this.commands, this.ledger); this.worldEvents = new WorldEventEngine(this.combat, this.ledger); this.raiders = new RaiderEngine(this.combat, this.ledger); this.onboarding = new OnboardingRepository(this.pool, this.commands); this.dailyQuests = new DailyQuestRepository(this.commands); this.logistics.seed(this.state); this.combat.seed(this.state); this.diplomacy.seed(this.state); this.worldEvents.seed(this.state); this.raiders.seed(this.state); }
  // `skipLedger` is for the command/moderation path: those call `load()` from *inside* their
  // transaction, and the ledger scan there bought nothing the in-transaction point query does not
  // already guarantee. Boot keeps the full load so `hasCommand()` starts warm.
  // Destructuring `processedCommands` off the saved row is the whole P0.3b migration: the next
  // `persistState` writes the row back without that key, so a row written by an older build
  // shrinks on its own instead of needing a migration for one field.
  async load(options?: { skipLedger?: boolean }): Promise<void> { if (this.pool) { try { const result = await this.pool.query<{ state: GameState }>("SELECT state FROM game_state WHERE state_key = $1", ["kingdom"]); if (result.rows[0]?.state) { const { processedCommands: _legacyProcessedCommands, ...saved } = result.rows[0].state as GameState & { processedCommands?: string[] }; if (saved.season.worldId !== worldAssetId) throw new IncompatibleWorldError(`WORLD_VERSION_MISMATCH: saved world ${saved.season.worldId ?? "meridian-36-v1"} cannot run on ${worldAssetId}. Keep the old save on its matching release; use a separate fresh database for the new world. No save was changed.`); this.state = { ...saved, players: saved.players.map(player => ({ ...player, crossSeasonReputation: player.crossSeasonReputation ?? 0 })), cities: saved.cities.map(city => ({ ...city, cityLayoutVersion: (city as any).cityLayoutVersion ?? 1, cityLayoutRevision: (city as any).cityLayoutRevision ?? 0, buildingPlots: city.buildingPlots ?? [] })), armies: (saved.armies ?? []).map(army => ({ ...army, ownerType: army.ownerType ?? "player", ownerPlayerId: army.ownerPlayerId ?? null })), commanders: saved.commanders ?? [], troopReserves: saved.troopReserves ?? {}, formationPresets: saved.formationPresets ?? [], trainingQueues: saved.trainingQueues ?? {}, hospitalQueues: saved.hospitalQueues ?? {}, technologyProgress: saved.technologyProgress ?? {}, researchQueues: saved.researchQueues ?? {}, campaignProgress: saved.campaignProgress ?? {}, activeOperations: saved.activeOperations ?? {}, heroes: saved.heroes ?? [], caravans: [], battleReports: (saved.battleReports ?? []).slice(-battleReportMemoryLimit), terrainMap: saved.terrainMap ?? {}, explorationMasks: saved.explorationMasks ?? {}, militaryThroughput: saved.militaryThroughput ?? {}, regionControl: saved.regionControl ?? {}, regionStates: saved.regionStates ?? {}, rivalIntents: saved.rivalIntents ?? [], regionControlRevision: saved.regionControlRevision ?? 0, alliances: saved.alliances ?? [], allianceVotes: saved.allianceVotes ?? [], treaties: saved.treaties ?? [], diplomacyThroughput: saved.diplomacyThroughput ?? {}, spyMissions: saved.spyMissions ?? [], worldEvents: (saved.worldEvents ?? []).map(event => ({ ...event, seed: event.seed ?? 0, lastPlagueAt: event.eventType === "plague" ? event.lastPlagueAt ?? event.startsAt : event.lastPlagueAt })), counterIntelActive: saved.counterIntelActive ?? {}, seasonMetrics: saved.seasonMetrics ?? { resourcesProduced: {} }, raiderSpawnState: saved.raiderSpawnState ?? { sequence: 0 }, logisticsCounters: saved.logisticsCounters ?? { exports: {}, harvests: {} }, cosmeticAccounts: saved.cosmeticAccounts ?? {}, dailyQuests: saved.dailyQuests ?? {}, activityCounters: saved.activityCounters ?? { trainingBatches: {}, caravansDelivered: {}, campaignsCompleted: {} } }; for (const city of this.state.cities) normalizeBuildingPlots(city); const reps = await this.pool.query<{ player_id: string; score: number }>("SELECT player_id, score FROM player_reputation WHERE player_id = ANY($1::uuid[])", [this.state.players.map(player => player.id)]); for (const row of reps.rows) { const player = this.findPlayer(row.player_id); if (player) player.crossSeasonReputation = row.score; } } } catch (error) { if (error instanceof IncompatibleWorldError) throw error; console.warn("database load skipped", error instanceof Error ? error.message : error); } } this.logistics.seed(this.state); this.combat.seed(this.state); await this.logistics.load(this.state); await this.combat.load(this.state); await this.diplomacy.load(this.state); await this.espionage.load(this.state); this.worldEvents.seed(this.state); this.raiders.seed(this.state); this.rivals.seed(this.state); ensureRegionStates(this.state); await this.onboarding.load(this.state); if (!options?.skipLedger) await this.ledger.load(); }
  // Tick-resolved battles and auto-canceled pursuit orders for the HTTP layer
  // to broadcast over WebSocket; cleared by takeTick* once read.
  takeTickBattleReports(): ReturnType<CombatRepository["drainReports"]> { const out = this.tickReportBatch; this.tickReportBatch = []; return out; }
  takeTickCancellations(): ReturnType<CombatRepository["drainCancellations"]> { const out = this.tickCancelBatch; this.tickCancelBatch = []; return out; }
  async save(): Promise<void> {
    normalizeLegacyArmies(this.state);
    normalizeNpcArmies(this.state);
    this.logistics.syncDepots(this.state);
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`state:${this.state.kingdom.id}`]);
      await this.persistState(client);
      await client.query("COMMIT");
      this.ledger.markPersisted();
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  private async persistState(client: PoolClient): Promise<void> { await this.logistics.persist(client, this.state); await this.combat.persist(client, this.state); await this.diplomacy.persist(client, this.state); await this.espionage.persist(client, this.state); await this.raiders.persist(client, this.state); await this.onboarding.persist(client, this.state); await this.ledger.persist(client); await client.query("INSERT INTO game_state (state_key, state) VALUES ($1, $2) ON CONFLICT (state_key) DO UPDATE SET state = EXCLUDED.state, updated_at = now()", ["kingdom", JSON.stringify(this.state)]); }
  async runExclusive<T>(action: () => Promise<T> | T): Promise<T> { let release!: () => void; const previous = this.writeQueue; this.writeQueue = new Promise<void>(resolve => { release = resolve; }); await previous; try { return await action(); } finally { release(); } }
  async executeCommand<T>(event: { eventType: string; aggregateType: string; aggregateId: string; commandId?: string; actorPlayerId: string }, action: () => T): Promise<{ alreadyApplied: boolean; result: T | "already_processed" }> {
    return this.runExclusive(() => this.executeCommandUnlocked(event, action));
  }
  private async executeCommandUnlocked<T>(event: { eventType: string; aggregateType: string; aggregateId: string; commandId?: string; actorPlayerId: string }, action: () => T): Promise<{ alreadyApplied: boolean; result: T | "already_processed" }> {
    if (event.commandId && this.ledger.hasCommand(event.commandId)) return { alreadyApplied: true, result: "already_processed" };
    let previousState = structuredClone(this.state); let previousLogistics = this.logistics.capture(); let previousEspionage = this.espionage.capture(); let previousOnboarding = this.onboarding.capture(); let appended: ReturnType<EventLedger["append"]> | undefined;
    // Opening the registry journal is one empty array; rolling it back forgets exactly the ids this
    // command claimed, so a command that throws stays retryable with the same `commandId`.
    this.commands.begin();
    if (!this.pool) { try { assertGameplaySeason(this.state, event.aggregateType); const result = action(); appended = this.ledger.append({ ...event, payload: result }); this.commands.commit(); return { alreadyApplied: false, result }; } catch (error) { this.state = previousState; this.logistics.restore(previousLogistics); this.espionage.restore(previousEspionage); this.onboarding.restore(previousOnboarding); this.commands.rollback(); if (appended) this.ledger.discard(appended.id); throw error; } }
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`state:${this.state.kingdom.id}`]); await this.load({ skipLedger: true }); previousState = structuredClone(this.state); previousLogistics = this.logistics.capture(); previousEspionage = this.espionage.capture(); previousOnboarding = this.onboarding.capture(); const actor = await client.query("SELECT status FROM players WHERE id=$1", [event.actorPlayerId]); if (actor.rows[0]?.status === "banned") throw new Error("ACCOUNT_BANNED"); if (event.commandId) { const existing = await client.query("SELECT 1 FROM event_ledger WHERE command_id=$1", [event.commandId]); if (existing.rowCount) { await client.query("ROLLBACK"); this.commands.rollback(); return { alreadyApplied: true, result: "already_processed" }; } } assertGameplaySeason(this.state, event.aggregateType); const result = action(); appended = this.ledger.append({ ...event, payload: result }); await this.persistState(client); await client.query("COMMIT"); this.ledger.markPersisted(); this.commands.commit(); return { alreadyApplied: false, result }; }
    catch (error) { await client.query("ROLLBACK"); this.state = previousState; this.logistics.restore(previousLogistics); this.espionage.restore(previousEspionage); this.onboarding.restore(previousOnboarding); this.commands.rollback(); if (appended) this.ledger.discard(appended.id); throw error; } finally { client.release(); }
  }
  migrateLegacyState(): void { normalizeLegacyArmies(this.state); for (const city of this.state.cities) city.productionAt ??= new Date().toISOString(); }
  get snapshot(): GameState { return this.state; }
  explorationFor(playerId: string) { return refreshExploration(this.state, playerId); }
  findPlayer(id: string): Player | undefined { return this.state.players.find(player => player.id === id); } findCity(id: string): CityState | undefined { return this.state.cities.find(city => city.id === id); }
  private cosmeticAccountFor(playerId: string): CosmeticAccount {
    const current = this.state.cosmeticAccounts[playerId];
    if (current) {
      current.owned ??= [];
      current.claimedRewardIds ??= [];
      current.equipped = { ...emptyEquipped(), ...(current.equipped ?? {}) };
      current.badges = Math.max(0, current.badges ?? 0);
      return current;
    }
    const created = emptyCosmeticAccount();
    this.state.cosmeticAccounts[playerId] = created;
    return created;
  }
  getPlayerHub(playerId: string): PlayerHub {
    const player = this.findPlayer(playerId);
    if (!player) throw new Error("PLAYER_NOT_FOUND");
    const account = this.cosmeticAccountFor(playerId);
    const progress = this.onboarding.progressFor(playerId);
    const score = this.state.scores[playerId] ?? { military: 0, economy: 0, diplomacy: 0, overall: 0 };
    const reputation = reputationCosmetic(player.crossSeasonReputation);
    return {
      catalogVersion: "meridian-cosmetics-v1",
      currencyLabel: "Huy hieu",
      catalog: cosmeticCatalog,
      wallet: { badges: account.badges },
      owned: account.owned,
      equipped: account.equipped,
      rewards: cosmeticRewards.map(reward => ({ id: reward.id, title: reward.title, amount: reward.amount, eligible: !reward.step || progress.completedSteps.includes(reward.step), claimed: account.claimedRewardIds.includes(reward.id) })),
      profile: { displayName: player.displayName, factionId: player.factionId, scores: score, crossSeasonReputation: player.crossSeasonReputation, title: reputation.title },
    };
  }
  claimCosmeticReward(playerId: string, commandId: string, rewardId: string): PlayerHub | "already_processed" {
    if (!this.commands.claim(commandId)) return "already_processed";
    if (this.isPlayerFrozen(playerId)) throw new Error("ACCOUNT_BANNED");
    this.onboarding.verify(this.state);
    const reward = cosmeticRewards.find(item => item.id === rewardId);
    if (!reward) throw new Error("UNKNOWN_REWARD");
    const account = this.cosmeticAccountFor(playerId);
    if (account.claimedRewardIds.includes(reward.id)) throw new Error("REWARD_ALREADY_CLAIMED");
    if (reward.step && !this.onboarding.progressFor(playerId).completedSteps.includes(reward.step)) throw new Error("REWARD_NOT_AVAILABLE");
    account.claimedRewardIds.push(reward.id);
    account.badges += reward.amount;
    return this.getPlayerHub(playerId);
  }
  purchaseCosmetic(playerId: string, commandId: string, itemId: string): PlayerHub | "already_processed" {
    if (!this.commands.claim(commandId)) return "already_processed";
    if (this.isPlayerFrozen(playerId)) throw new Error("ACCOUNT_BANNED");
    const item = cosmeticCatalog.find(candidate => candidate.id === itemId);
    if (!item) throw new Error("UNKNOWN_COSMETIC");
    const account = this.cosmeticAccountFor(playerId);
    if (account.owned.some(owned => owned.itemId === item.id)) throw new Error("COSMETIC_ALREADY_OWNED");
    if (account.badges < item.price) throw new Error("INSUFFICIENT_BADGES");
    account.badges -= item.price;
    account.owned.push({ itemId: item.id, acquiredAt: new Date().toISOString() });
    return this.getPlayerHub(playerId);
  }
  equipCosmetic(playerId: string, commandId: string, slot: CosmeticSlot, itemId: string | null): PlayerHub | "already_processed" {
    if (!this.commands.claim(commandId)) return "already_processed";
    if (this.isPlayerFrozen(playerId)) throw new Error("ACCOUNT_BANNED");
    const account = this.cosmeticAccountFor(playerId);
    if (itemId !== null) {
      const item = cosmeticCatalog.find(candidate => candidate.id === itemId);
      if (!item || item.slot !== slot || !account.owned.some(owned => owned.itemId === itemId)) throw new Error("COSMETIC_NOT_OWNED");
    }
    account.equipped[slot] = itemId;
    return this.getPlayerHub(playerId);
  }
  get databasePool(): Pool | undefined { return this.pool; }
  async close(): Promise<void> { if (this.pool && !this.pool.ended) { await this.pool.end(); } }
  createRegisteredPlayer(displayName: string, factionId: FactionId): { player: Player; city: CityState } { const player: Player = { id: randomUUID(), displayName, factionId, kingdomId: this.state.kingdom.id, crossSeasonReputation: 0, status: "active" }; const placement = cityPlacement(this.state, this.logistics); const city = makeCity(player.id, `${factions[factionId].name} City`, placement.x, placement.y); const commander: Commander = { ...initialCommanderCatalog[0]!, id: `${initialCommanderCatalog[0]!.id}-${player.id}`, ownerPlayerId: player.id, level: 1, xp: 0, assignedArmyId: undefined }; this.state.players.push(player); this.state.cities.push(city); this.state.commanders.push(commander); this.state.troopReserves[city.id] = { cityId: city.id, ownerPlayerId: player.id, available: emptyTroopCounts(), wounded: emptyTroopCounts() }; this.recalculateScores(); return { player, city }; }
  rollbackRegisteredPlayer(playerId: string): void { this.state.players = this.state.players.filter(player => player.id !== playerId); this.state.cities = this.state.cities.filter(city => city.playerId !== playerId); delete this.state.scores[playerId]; delete this.state.diplomacyThroughput[playerId]; delete this.state.militaryThroughput[playerId]; }
  isPlayerFrozen(playerId: string | null | undefined): boolean { return Boolean(playerId && this.findPlayer(playerId)?.status === "banned"); }
  setPlayerStatus(playerId: string, status: "active" | "banned", frozenAt?: string): void {
    const player = this.findPlayer(playerId); if (!player) throw new Error("PLAYER_NOT_FOUND"); const now = Date.now(); const previousFrozenAt = player.bannedAt ?? this.state.cities.find(city => city.playerId === playerId)?.frozenAt; const deltaMs = status === "active" && previousFrozenAt ? Math.max(0, now - Date.parse(previousFrozenAt)) : 0;
    player.status = status; player.bannedAt = status === "banned" ? frozenAt ?? new Date(now).toISOString() : undefined;
    for (const city of this.state.cities.filter(item => item.playerId === playerId)) { if (status === "active" && deltaMs) for (const queue of city.queues) queue.completesAt = new Date(Date.parse(queue.completesAt) + deltaMs).toISOString(); city.frozen = status === "banned"; city.frozenAt = status === "banned" ? player.bannedAt : undefined; }
    for (const army of this.state.armies.filter(item => item.ownerPlayerId === playerId)) { if (status === "active" && deltaMs && army.nextActionAt) army.nextActionAt = new Date(Date.parse(army.nextActionAt) + deltaMs).toISOString(); if (status === "active" && deltaMs && army.lastSupplyAt) army.lastSupplyAt = new Date(Date.parse(army.lastSupplyAt) + deltaMs).toISOString(); army.frozen = status === "banned"; army.frozenAt = status === "banned" ? player.bannedAt : undefined; }
    this.logistics.setPlayerFrozen(playerId, status === "banned", status === "banned" ? player.bannedAt : undefined, deltaMs, this.state); this.espionage.setPlayerFrozen(playerId, status === "banned", deltaMs, this.state);
  }
  async moderatePlayer(playerId: string, status: "active" | "banned", reason: string): Promise<{ status: "active" | "banned"; alreadyApplied: boolean }> { return this.runExclusive(() => this.moderatePlayerUnlocked(playerId, status, reason)); }
  private async moderatePlayerUnlocked(playerId: string, status: "active" | "banned", reason: string): Promise<{ status: "active" | "banned"; alreadyApplied: boolean }> {
    let player = this.findPlayer(playerId); if (!player) throw new Error("PLAYER_NOT_FOUND");
    let previousState = structuredClone(this.state); let previousLogistics = this.logistics.capture(); let previousEspionage = this.espionage.capture(); const frozenAt = status === "banned" ? new Date().toISOString() : undefined; let event: ReturnType<EventLedger["append"]> | undefined;
    if (!this.pool) { if ((player.status ?? "active") === status) return { status, alreadyApplied: true }; this.setPlayerStatus(playerId, status, frozenAt); this.ledger.append({ eventType: status === "banned" ? "player.ban" : "player.unban", aggregateType: "player", aggregateId: playerId, payload: { reason, status } }); return { status, alreadyApplied: false }; }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`state:${this.state.kingdom.id}`]); await this.load({ skipLedger: true }); player = this.findPlayer(playerId)!; previousState = structuredClone(this.state); previousLogistics = this.logistics.capture(); previousEspionage = this.espionage.capture(); const locked = await client.query("SELECT p.status,u.banned_at FROM players p LEFT JOIN users u ON u.id=p.user_id WHERE p.id=$1 FOR UPDATE OF p", [playerId]);
      if (locked.rows[0]?.status === status) { await client.query("ROLLBACK"); return { status, alreadyApplied: true }; }
      if (status === "active" && locked.rows[0]?.banned_at) player.bannedAt = new Date(locked.rows[0].banned_at).toISOString();
      const pausedMs = status === "active" && player.bannedAt ? Math.max(0, Date.now() - Date.parse(player.bannedAt)) : 0; this.setPlayerStatus(playerId, status, frozenAt);
      await client.query("UPDATE users SET status=$1,banned_at=$2,banned_reason=$3 WHERE id=(SELECT user_id FROM players WHERE id=$4)", [status, frozenAt ?? null, status === "banned" ? reason : null, playerId]);
      await client.query("UPDATE players SET status=$1 WHERE id=$2", [status, playerId]); await client.query("UPDATE cities SET frozen=$1,frozen_at=$2 WHERE player_id=$3", [status === "banned", frozenAt ?? null, playerId]); await client.query("UPDATE city_resources SET frozen=$1 WHERE city_id IN (SELECT id FROM cities WHERE player_id=$2)", [status === "banned", playerId]); await client.query("UPDATE armies SET frozen=$1,frozen_at=$2 WHERE player_id=$3", [status === "banned", frozenAt ?? null, playerId]); await client.query("UPDATE caravans SET frozen=$1,frozen_at=$2 WHERE owner_player_id=$3", [status === "banned", frozenAt ?? null, playerId]);
      if (pausedMs > 0) { await client.query("UPDATE build_queues q SET completes_at=completes_at+($1::bigint*interval '1 millisecond') FROM cities c WHERE q.city_id=c.id AND c.player_id=$2", [pausedMs, playerId]); await client.query("UPDATE armies SET next_action_at=next_action_at+($1::bigint*interval '1 millisecond'), last_supply_at=last_supply_at+($1::bigint*interval '1 millisecond') WHERE player_id=$2 AND last_supply_at IS NOT NULL", [pausedMs, playerId]); await client.query("UPDATE caravans SET departed_at=departed_at+($1::bigint*interval '1 millisecond'),arrives_at=arrives_at+($1::bigint*interval '1 millisecond') WHERE owner_player_id=$2", [pausedMs, playerId]); await client.query("UPDATE espionage_actions SET completes_at=completes_at+($1::bigint*interval '1 millisecond') WHERE status='in_progress' AND (actor_player_id=$2 OR target_player_id=$2)", [pausedMs, playerId]); await client.query("UPDATE counter_intel_active SET expires_at=expires_at+($1::bigint*interval '1 millisecond') WHERE player_id=$2", [pausedMs, playerId]); await client.query("UPDATE spy_cooldowns SET available_at=available_at+($1::bigint*interval '1 millisecond') WHERE player_id=$2", [pausedMs, playerId]); }
      await client.query("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE player_id=$1 AND revoked_at IS NULL", [playerId]); await client.query("INSERT INTO admin_actions(id,actor_id,action_type,reason) VALUES($1,NULL,$2,$3)", [randomUUID(), status === "banned" ? "player.ban" : "player.unban", reason]);
      event = this.ledger.append({ eventType: status === "banned" ? "player.ban" : "player.unban", aggregateType: "player", aggregateId: playerId, payload: { reason, status } }); await this.persistState(client); await client.query("COMMIT"); this.ledger.markPersisted(); return { status, alreadyApplied: false };
    } catch (error) { await client.query("ROLLBACK"); this.state = previousState; this.logistics.restore(previousLogistics); this.espionage.restore(previousEspionage); if (event) this.ledger.discard(event.id); throw error; } finally { client.release(); }
  }
  addDevPlayer(displayName: string, factionId: FactionId): Player { const existing = this.state.players.find(player => player.displayName.toLowerCase() === displayName.toLowerCase()); if (existing) return existing; const player: Player = { id: randomUUID(), displayName, factionId, kingdomId: this.state.kingdom.id, crossSeasonReputation: 0, status: "active" }; const placement = cityPlacement(this.state, this.logistics); const city = makeCity(player.id, `${factions[factionId].name} City`, placement.x, placement.y); const commander: Commander = { ...initialCommanderCatalog[0]!, id: `${initialCommanderCatalog[0]!.id}-${player.id}`, ownerPlayerId: player.id, level: 1, xp: 0, assignedArmyId: undefined }; this.state.players.push(player); this.state.cities.push(city); this.state.commanders.push(commander); this.state.troopReserves[city.id] = { cityId: city.id, ownerPlayerId: player.id, available: emptyTroopCounts(), wounded: emptyTroopCounts() }; return player; }
  startBuild(playerId: string, commandId: string, cityId: string, buildingId: string, queueType: "build" | "research", requestedPlot?: { x: number; y: number; rotation?: CityRotation }): string {
    if (!this.commands.claim(commandId)) return "already_processed";
    if (this.isPlayerFrozen(playerId)) throw new Error("ACCOUNT_BANNED");
    const city = this.findCity(cityId);
    if (!city || city.playerId !== playerId) throw new Error("CITY_ACCESS_DENIED");
    if (city.frozen) throw new Error("ACCOUNT_BANNED");
    const limit = queueType === "build" ? 2 : 1;
    if (city.queues.filter(queue => queue.type === queueType).length >= limit) throw new Error("QUEUE_LIMIT_REACHED");
    const cost = buildingCosts[buildingId];
    if (!cost) throw new Error("UNKNOWN_BUILDING");

    normalizeBuildingPlots(city);
    let placement = city.buildingPlots.find(item => item.buildingId === buildingId);
    if (placement && requestedPlot && (placement.x !== requestedPlot.x || placement.y !== requestedPlot.y || (requestedPlot.rotation !== undefined && placement.rotation !== requestedPlot.rotation))) {
      throw new Error("BUILDING_ALREADY_PLACED");
    }
    if (!placement) {
      const size = cityGridSize(city.buildings.town_hall ?? 1);
      const rot = (requestedPlot?.rotation ?? 0) as CityRotation;
      if (!cityRotations.includes(rot)) throw new Error("INVALID_BUILDING_ROTATION");
      const bId = buildingId as BuildingId;
      const { width, height } = buildingDimensions(bId, rot);

      const occupiedTiles = new Set<string>();
      for (const p of city.buildingPlots) {
        for (const t of buildingOccupiedTiles(p)) occupiedTiles.add(`${t.x},${t.y}`);
      }

      if (requestedPlot) {
        if (!isPlacementWithinBounds({ buildingId: bId, x: requestedPlot.x, y: requestedPlot.y, rotation: rot }, size)) {
          throw new Error("CITY_PLOT_OUT_OF_BOUNDS");
        }
        const tiles = buildingOccupiedTiles({ buildingId: bId, x: requestedPlot.x, y: requestedPlot.y, rotation: rot });
        if (tiles.some(t => occupiedTiles.has(`${t.x},${t.y}`))) {
          throw new Error("CITY_PLOT_OCCUPIED");
        }
        placement = { buildingId: bId, x: requestedPlot.x, y: requestedPlot.y, rotation: rot };
      } else {
        // Auto-find closest valid position with rotation 0
        const center = Math.floor((size - width) / 2);
        let bestCandidate: BuildingPlacement | undefined;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let y = 0; y <= size - height; y++) {
          for (let x = 0; x <= size - width; x++) {
            const tiles = buildingOccupiedTiles({ buildingId: bId, x, y, rotation: 0 });
            if (tiles.every(t => !occupiedTiles.has(`${t.x},${t.y}`))) {
              const dist = Math.abs(x - center) + Math.abs(y - center);
              if (dist < bestDist) {
                bestDist = dist;
                bestCandidate = { buildingId: bId, x, y, rotation: 0 };
              }
            }
          }
        }
        if (!bestCandidate) throw new Error("CITY_FULL");
        placement = bestCandidate;
      }
    }
    for (const key of ["food", "wood", "stone", "iron"] as const) if (city.resources[key] < cost[key]) throw new Error("INSUFFICIENT_RESOURCES");
    for (const key of ["food", "wood", "stone", "iron"] as const) city.resources[key] -= cost[key];
    if (!city.buildingPlots.some(item => item.buildingId === buildingId)) city.buildingPlots.push(placement);
    const queuedCount = city.queues.filter(q => q.buildingId === buildingId).length;
    if ((city.buildings[buildingId] ?? 0) + queuedCount >= 3) throw new Error("BUILDING_MAX_LEVEL");
    const now = Date.now();
    city.queues.push({
      id: randomUUID(),
      type: queueType,
      buildingId,
      targetLevel: (city.buildings[buildingId] ?? 0) + queuedCount + 1,
      startedAt: new Date(now).toISOString(),
      completesAt: new Date(now + cost.seconds * 1000).toISOString(),
      plotX: placement.x,
      plotY: placement.y,
      plotRotation: placement.rotation,
    });
    return "accepted";
  }
  updateCityLayout(playerId: string, commandId: string, cityId: string, layoutVersion: number, expectedRevision: number, placements: BuildingPlacement[]): { previousRevision: number; revision: number; placements: BuildingPlacement[] } {
    if (!this.commands.claim(commandId)) return "already_processed" as any;
    if (this.isPlayerFrozen(playerId)) throw new Error("ACCOUNT_BANNED");
    const city = this.findCity(cityId);
    if (!city || city.playerId !== playerId) throw new Error("CITY_ACCESS_DENIED");
    if (city.frozen) throw new Error("ACCOUNT_BANNED");
    if (this.state.season.status !== "ACTIVE") throw new Error("SEASON_NOT_ACTIVE");

    normalizeBuildingPlots(city);

    if (city.cityLayoutRevision !== expectedRevision) {
      throw new Error("CITY_LAYOUT_STALE");
    }

    const currentBuildings = new Set(city.buildingPlots.map(p => p.buildingId));
    const submittedBuildings = new Set(placements.map(p => p.buildingId));
    if (
      placements.length !== city.buildingPlots.length ||
      placements.length !== submittedBuildings.size ||
      currentBuildings.size !== submittedBuildings.size
    ) {
      throw new Error("CITY_LAYOUT_INVALID_SET");
    }
    for (const bId of currentBuildings) {
      if (!submittedBuildings.has(bId)) throw new Error("CITY_LAYOUT_INVALID_SET");
    }

    const queuedBuildingIds = new Set(city.queues.map(q => q.buildingId));
    for (const qId of queuedBuildingIds) {
      const current = city.buildingPlots.find(p => p.buildingId === qId);
      const submitted = placements.find(p => p.buildingId === qId);
      if (
        !current ||
        !submitted ||
        current.x !== submitted.x ||
        current.y !== submitted.y ||
        current.rotation !== submitted.rotation
      ) {
        throw new Error("CITY_BUILDING_LOCKED");
      }
    }

    const size = cityGridSize(city.buildings?.town_hall ?? 1);
    const validation = validatePlacements(placements, size);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const previousRevision = city.cityLayoutRevision;
    city.cityLayoutRevision += 1;
    city.buildingPlots = placements;

    return { previousRevision, revision: city.cityLayoutRevision, placements };
  }
  tick(): boolean { let changed = false; const now = Date.now(); for (const city of this.state.cities) if (!city.frozen && this.findPlayer(city.playerId)?.status !== "banned") for (const queue of city.queues.filter(item => Date.parse(item.completesAt) <= now)) { city.buildings[queue.buildingId] = queue.targetLevel; city.queues = city.queues.filter(item => item.id !== queue.id); changed = true; } changed = this.armyManagement.tick(this.state, now) || changed; changed = this.progression.tick(this.state, now) || changed; changed = this.operations.tick(this.state, now) || changed; changed = this.applySupplyZones(now) || changed; this.logistics.syncDepots(this.state); const logisticsChanged = this.logistics.tick(this.state); const combatChanged = this.combat.tick(this.state, this.diplomacy); const diplomacyChanged = this.diplomacy.tick(this.state); const espionageChanged = this.espionage.tick(this.state); const worldEventsChanged = this.worldEvents.tick(this.state); const raiderChanged = this.raiders.tick(this.state); const rivalChanged = this.rivals.tick(this.state, now); const territoryChanged = tickTerritory(this.state, config.tickMs, now, playerId => this.isPlayerFrozen(playerId)); changed = logisticsChanged || combatChanged || diplomacyChanged || espionageChanged || worldEventsChanged || raiderChanged || rivalChanged || territoryChanged || changed; this.tickReportBatch = this.combat.drainReports(); const cancellations = this.combat.drainCancellations(); this.tickCancelBatch = cancellations; for (const report of this.tickReportBatch) if (report.attacker.playerId || report.defender.playerId) this.ledger.append({ eventType: "combat.resolved", aggregateType: "combat", aggregateId: report.id, payload: { seed: report.seed, victor: report.victor, attackerArmyId: report.attacker.armyId, defenderArmyId: report.defender.armyId, attackerPlayerId: report.attacker.playerId ?? null, defenderPlayerId: report.defender.playerId ?? null, input: { seed: report.seed }, result: report } }); for (const cancellation of cancellations) this.ledger.append({ eventType: "attack_order.canceled", aggregateType: "army", aggregateId: cancellation.armyId, payload: { orderId: cancellation.orderId, targetArmyId: cancellation.targetArmyId, reason: cancellation.reason } }); if (logisticsChanged) this.ledger.append({ eventType: "logistics.tick", aggregateType: "kingdom", aggregateId: this.state.kingdom.id, payload: { caravans: this.logistics.caravans().map(caravan => ({ id: caravan.id, status: caravan.status, progress: caravan.progress, ambushSeed: caravan.ambushSeed })) } }); if (diplomacyChanged) this.ledger.append({ eventType: "diplomacy.tick", aggregateType: "kingdom", aggregateId: this.state.kingdom.id, payload: { alliances: this.state.alliances.map(alliance => ({ id: alliance.id, leaderPlayerId: alliance.leaderPlayerId, leaderTermStartedAt: alliance.leaderTermStartedAt })), votes: this.state.allianceVotes.map(vote => ({ id: vote.id, status: vote.status })) } }); if (this.onboarding.verify(this.state)) changed = true; if (this.dailyQuests.verify(this.state)) changed = true; this.recalculateScores(); return changed; }
  // `militaryThroughput` also tracks `defeats`, `strengthDestroyed` and `strengthLost`
  // (written in `combat.ts`, reported by `buildSeasonAnalytics`), but `militaryScore`
  // reads only these four — losses cost a player nothing on the scoreboard today.
  // That is a design decision belonging to `docs/GAME-DESIGN.md`, not a bug to patch
  // here, so the zero-fallback stops claiming values the formula never looks at.
  //
  // `tilesControlled` is written here rather than accumulated: it is recomputed from where
  // armies stand this tick, so it falls back to nothing when they march away. An entry is
  // created the first time a player holds ground, the way `combat.ts` creates one the first
  // time they fight — which is what stops territory score from depending on having been in a
  // battle. A player who holds nothing and never fought still gets no row, so
  // `military_throughput` stays the size of the players who did something.
  recalculateScores(): void { const held = controlledTilesFromStates(this.state.regionStates); for (const player of this.state.players) { const delivered = this.logistics.snapshot().throughput[player.id]; const tilesControlled = held[player.id] ?? 0; let stats = this.state.militaryThroughput[player.id]; if (!stats && tilesControlled > 0) stats = this.state.militaryThroughput[player.id] = { victories: 0, defeats: 0, draws: 0, strengthDestroyed: 0, strengthLost: 0, tilesControlled: 0, successfulDefenses: 0 }; if (stats) stats.tilesControlled = tilesControlled; const economy = Math.min(1000, Math.floor(((delivered?.wood ?? 0) + (delivered?.stone ?? 0) + (delivered?.iron ?? 0) * 2) / 2)); const military = militaryScore(stats ?? { victories: 0, draws: 0, tilesControlled: 0, successfulDefenses: 0 }); const scores = { military, economy, diplomacy: diplomacyScore(this.diplomacy.getStats(player.id, this.state)), overall: 0 } satisfies Scores; scores.overall = overallScore(scores); this.state.scores[player.id] = scores; } }
  // Per-minute supply cycle: army.Source zones re-evaluated each elapsed minute
  // from last_supply_at; +10 inside own city radius, +15 at own depot radius
  // (higher wins, not stacked), -5 outside; attrition below 25 supply. NPCs and
  // frozen/banned armies are exempt (their clock stops until unbanned).
  private applySupplyZones(now: number): boolean {
    let changed = false;
    const { insideCityRadius, insideCityPerMinute, depotRadiusBase, depotRadiusPerLevel, atDepotPerMinute, outsidePerMinute, attritionBelowSupply, attritionStrengthPerMinute, attritionMoralePerMinute, min, max } = gameRules.supply;
    const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    for (const army of this.state.armies) {
      if (army.ownerType !== "player") continue;
      if (army.frozen || (army.ownerPlayerId && this.findPlayer(army.ownerPlayerId)?.status === "banned")) continue;
      if (!army.lastSupplyAt) { army.lastSupplyAt = new Date(now).toISOString(); changed = true; continue; }
      const elapsedMinutes = Math.floor((now - Date.parse(army.lastSupplyAt)) / 60_000);
      if (elapsedMinutes <= 0) continue;
      army.lastSupplyAt = new Date(Date.parse(army.lastSupplyAt) + elapsedMinutes * 60_000).toISOString();
      const ownCity = army.ownerPlayerId ? this.state.cities.find(city => city.playerId === army.ownerPlayerId) : undefined;
      const quartermaster = army.ownerPlayerId ? this.state.technologyProgress[army.ownerPlayerId]?.unlocked.includes("quartermaster_drills") : false;
      let rate: number = quartermaster ? Math.ceil(outsidePerMinute * 0.8) : outsidePerMinute;
      if (ownCity) {
        if (manhattan(ownCity, army) <= insideCityRadius) rate = insideCityPerMinute;
        const depot = this.logistics.snapshot().depots.find(depot => depot.cityId === ownCity.id);
        const relayStations = army.ownerPlayerId ? this.state.technologyProgress[army.ownerPlayerId]?.unlocked.includes("relay_stations") : false;
        if (depot && manhattan(ownCity, army) <= depotRadiusBase + depotRadiusPerLevel * depot.level + (relayStations ? 1 : 0)) rate = Math.max(rate, atDepotPerMinute);
      }
      const doctrineSupply = army.ownerPlayerId ? ({ meridian: 0.8, bastion: 1, ravager: 1.15, veiled: 1 } as const)[this.findPlayer(army.ownerPlayerId)?.factionId ?? "meridian"] : 1;
      const supplyBefore = army.supply;
      const adjustedRate = rate < 0 ? Math.ceil(rate * doctrineSupply) : rate;
      const next = Math.min(max, Math.max(min, supplyBefore + adjustedRate * elapsedMinutes));
      if (next !== supplyBefore) { army.supply = next; changed = true; }
      // Attrition applies per minute, so only the minutes supply actually ends
      // below the threshold count — not the whole offline window. With a linear
      // rate, the crossing minute is floor((threshold - supplyBefore) / rate)
      // minutes into the window (rate < 0 by definition of a draining zone).
      let minutesBelow = 0;
      if (adjustedRate < 0) {
        if (supplyBefore < attritionBelowSupply) minutesBelow = elapsedMinutes;
        else minutesBelow = Math.max(0, elapsedMinutes - Math.floor((attritionBelowSupply - supplyBefore) / adjustedRate));
      }
      if (minutesBelow > 0) {
        // Attrition removes troops from the squads for composition armies and
        // keeps strength mirroring the total — strength-only attrition here is
        // what used to push the two out of sync.
        if (army.composition) {
          if (applyCompositionLosses(army, attritionStrengthPerMinute * minutesBelow)) changed = true;
        } else if (army.strength > 1) { army.strength = Math.max(1, army.strength - attritionStrengthPerMinute * minutesBelow); changed = true; }
        if (army.morale > 0) { army.morale = Math.max(0, army.morale - attritionMoralePerMinute * minutesBelow); changed = true; }
      }
    }
    return changed;
  }
  private prepareFinalization(now: number) { const seasonId = this.state.season.id; this.state.season.status = "FINALIZING"; this.recalculateScores(); const rankings = this.state.players.map(player => ({ playerId: player.id, scores: this.state.scores[player.id], overall: this.state.scores[player.id].overall })).sort((a, b) => b.overall - a.overall || a.playerId.localeCompare(b.playerId)).map((item, index) => ({ ...item, rank: index + 1 })); const closedAt = new Date(now).toISOString(); const legacy = buildLegacyRecords(this.state, seasonId, rankings); const analytics = buildSeasonAnalytics(this.state, seasonId, rankings); this.state.seasonHistory.push({ seasonId, rankings, closedAt }); this.state.legacyRecords.push(...legacy); const fullSnapshot = { ...structuredClone(this.state), logistics: structuredClone(this.logistics.snapshot()), caravans: structuredClone(this.logistics.caravans()), resetTemplate: seasonResetTemplate }; return { seasonId, rankings, closedAt, legacy, analytics, fullSnapshot, checksum: createHash("sha256").update(JSON.stringify(fullSnapshot)).digest("hex") }; }
  async finalizeIfDue(options: { force?: boolean; reason?: string } = {}): Promise<boolean> { const now = Date.now(); if (this.state.season.status !== "ACTIVE" || (!options.force && Date.parse(this.state.season.endsAt) > now)) return false; const previousState = structuredClone(this.state); const previousLogistics = this.logistics.capture(); const previousEspionage = this.espionage.capture(); if (!this.pool) { const result = this.prepareFinalization(now); hardReset(this.state, newSeason()); this.logistics.resetForSeason(this.state); this.espionage.resetForSeason(); this.commands.clear(); this.ledger.append({ eventType: "season.finalized", aggregateType: "season", aggregateId: result.seasonId, payload: { checksum: result.checksum, resetTemplate: seasonResetTemplate } }); return true; } return this.finalizeInDatabase(now, options, previousState, previousLogistics, previousEspionage); }
  private async finalizeInDatabase(now: number, options: { force?: boolean; reason?: string }, previousState: GameState, previousLogistics: ReturnType<LogisticsRepository["capture"]>, previousEspionage: ReturnType<EspionageRepository["capture"]>): Promise<boolean> { const client = await this.pool!.connect(); try { await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`state:${this.state.kingdom.id}`]); await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${this.state.kingdom.id}:${this.state.season.id}`]); await client.query("INSERT INTO seasons (id, kingdom_id, status, starts_at, ends_at, config) VALUES ($1,$2,'ACTIVE',$3,$4,$5) ON CONFLICT (id) DO NOTHING", [this.state.season.id, this.state.kingdom.id, this.state.season.startsAt, this.state.season.endsAt, JSON.stringify({ resetTemplate: seasonResetTemplate })]); const claimed = await client.query("UPDATE seasons SET status='FINALIZING' WHERE id=$1 AND finalized_at IS NULL AND status IN ('ACTIVE','FINALIZING') RETURNING id", [this.state.season.id]); if (!claimed.rowCount) { await client.query("ROLLBACK"); return false; } const result = this.prepareFinalization(now); await this.persistSeasonResult(client, result); hardReset(this.state, newSeason()); this.logistics.resetForSeason(this.state); this.espionage.resetForSeason(); await this.persistSeasonReset(client, result.seasonId, result.closedAt, options); this.ledger.append({ eventType: "season.finalized", aggregateType: "season", aggregateId: result.seasonId, payload: { checksum: result.checksum, resetTemplate: seasonResetTemplate } }); await this.persistState(client); await client.query("COMMIT"); this.ledger.markPersisted(); this.commands.clear(); return true; } catch (error) { await client.query("ROLLBACK"); this.state = previousState; this.logistics.restore(previousLogistics); this.espionage.restore(previousEspionage); throw error; } finally { client.release(); } }
  private async persistSeasonResult(client: PoolClient, result: ReturnType<GameStore["prepareFinalization"]>): Promise<void> { await client.query("INSERT INTO season_snapshots (season_id, snapshot, checksum) VALUES ($1,$2,$3) ON CONFLICT (season_id) DO NOTHING", [result.seasonId, JSON.stringify(result.fullSnapshot), result.checksum]); for (const ranking of result.rankings) await client.query("INSERT INTO season_rankings (season_id, player_id, overall_score, military_score, economy_score, diplomacy_score, rank) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (season_id, player_id) DO NOTHING", [result.seasonId, ranking.playerId, ranking.overall, ranking.scores.military, ranking.scores.economy, ranking.scores.diplomacy, ranking.rank]); for (const record of result.legacy) await client.query("INSERT INTO legacy_records (id, owner_id, season_id, record_type, payload, template_version) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING", [record.id, record.ownerId, record.seasonId, record.recordType, JSON.stringify(record.payload), seasonResetTemplate]); for (const event of result.analytics) await client.query("INSERT INTO analytics_events (id, season_id, player_id, event_type, payload) VALUES ($1,$2,$3,$4,$5)", [event.id, event.seasonId, event.playerId ?? null, event.eventType, JSON.stringify(event.payload)]); }
  private async persistSeasonReset(client: PoolClient, closedSeasonId: string, closedAt: string, options: { force?: boolean; reason?: string }): Promise<void> { for (const player of this.state.players) await client.query("INSERT INTO player_reputation (player_id, score) VALUES ($1,$2) ON CONFLICT (player_id) DO UPDATE SET score=EXCLUDED.score", [player.id, player.crossSeasonReputation]); const playerIds = this.state.players.map(player => player.id); if (playerIds.length) { // Caravans, cargo and trade routes survive the season boundary with the
    // in-memory state (resetForSeason keeps them), so they are not deleted here.
    await client.query("DELETE FROM spy_cooldowns WHERE player_id = ANY($1::uuid[])", [playerIds]); await client.query("DELETE FROM counter_intel_active WHERE player_id = ANY($1::uuid[])", [playerIds]); } await client.query("DELETE FROM diplomacy_treaties WHERE kingdom_id=$1", [this.state.kingdom.id]); await client.query("DELETE FROM espionage_actions WHERE kingdom_id=$1", [this.state.kingdom.id]); await client.query("DELETE FROM world_events WHERE kingdom_id=$1", [this.state.kingdom.id]); await client.query("UPDATE seasons SET status='CLOSED', finalized_at=$2 WHERE id=$1", [closedSeasonId, closedAt]); await client.query("INSERT INTO seasons (id, kingdom_id, status, starts_at, ends_at, config) VALUES ($1,$2,'ACTIVE',$3,$4,$5)", [this.state.season.id, this.state.kingdom.id, this.state.season.startsAt, this.state.season.endsAt, JSON.stringify({ resetTemplate: seasonResetTemplate })]); if (options.force) await client.query("INSERT INTO admin_actions (id, actor_id, action_type, reason) VALUES ($1,NULL,'season.close',$2)", [randomUUID(), options.reason ?? "manual close"]); }
  archiveForPlayer(playerId: string) { const latest = this.state.seasonHistory.at(-1); const player = this.findPlayer(playerId); if (!player) throw new Error("PLAYER_NOT_FOUND"); return { seasons: this.state.seasonHistory.map(history => ({ seasonId: history.seasonId, closedAt: history.closedAt, rankings: history.rankings.map(ranking => ({ ...ranking, displayName: this.findPlayer(ranking.playerId)?.displayName ?? "Unknown", factionId: this.findPlayer(ranking.playerId)?.factionId ?? "meridian" })) })), profile: { crossSeasonReputation: player.crossSeasonReputation, ...reputationCosmetic(player.crossSeasonReputation), crown: Boolean(latest?.rankings.some(ranking => ranking.playerId === playerId && ranking.rank <= 3)), legacyRecords: this.state.legacyRecords.filter(record => record.ownerId === playerId).map(({ id, seasonId, recordType, payload }) => ({ id, seasonId, recordType, payload })) } }; }
}

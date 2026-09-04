import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Caravan, Depot, DestinationKind, LogisticsSnapshot, MarketHub, ResourceNode, Resources, TradeRoute } from "@kingdoms/shared";
import { anchors, gameRules, regionAt, worldId } from "@kingdoms/shared";
import type { CityState, GameState } from "./types.js";
import { CommandRegistry } from "./command-registry.js";

type Throughput = { wood: number; stone: number; iron: number };
type LogisticsData = LogisticsSnapshot & { caravans: Caravan[] };
// Claimed command ids used to be copied in here too, twice per command. They live in the shared
// `CommandRegistry` now, which the store rolls back in one call; this capture is the real state.
type LogisticsCapture = { data: LogisticsData };
const resourceKeys = ["wood", "stone", "iron"] as const;
const emptyThroughput = (): Throughput => ({ wood: 0, stone: 0, iron: 0 });
const depotCapacity = (level: number) => level * 100;
const mapExtent = gameRules.map.extent;
/** What a mine holds and how fast it comes back, by what it produces — the three rates the three
 *  hand-written nodes used to carry, kept to the tile. Iron recovers slowest, which is the other
 *  half of "iron is the scarce one" (the map authors only eight of them). These are logistics
 *  balance numbers, not geography, so they live here rather than beside the map. */
const recoveryRates = { wood: 5, stone: 5, iron: 3 } as const;
const nodeCapacity = 1000;
/** Which province a mine pays into. Throws only if an anchor has been authored outside the grid,
 *  which `world-map.test.ts` already forbids. Derived per kingdom so two kingdoms sharing the
 *  authored map do not share a `regions` row. */
const anchorRegionId = (kingdomId: string, x: number, y: number): string => {
  const region = regionAt(x, y);
  if (!region) throw new Error(`anchor ${x},${y} is outside the authored world`);
  return worldId(kingdomId, "region", region.code);
};
// Manhattan reach an ambusher needs to the caravan's current tile. Owner-set: 3 tiles, so a
// raid costs a real march and the escort system has something to defend against.
const ambushRange = 3;
const assertActivePlayer = (state: GameState, playerId: string) => { if (state.players.find(player => player.id === playerId)?.status === "banned") throw new Error("ACCOUNT_BANNED"); };
const assertActiveTarget = (state: GameState, playerId: string, frozen?: boolean) => { if (frozen || state.players.find(player => player.id === playerId)?.status === "banned") throw new Error("TARGET_FROZEN"); };

// Center-out spiral search from the anchor tile; returns the first free tile.
function findHubTile(anchorX: number, anchorY: number, occupied: Set<string>): { x: number; y: number } {
  const free = (x: number, y: number) => x >= 0 && x < mapExtent && y >= 0 && y < mapExtent && !occupied.has(`${x},${y}`);
  if (free(anchorX, anchorY)) return { x: anchorX, y: anchorY };
  for (let radius = 1; radius < mapExtent; radius++) {
    for (let offset = -radius; offset <= radius; offset++) {
      if (free(anchorX + offset, anchorY - radius)) return { x: anchorX + offset, y: anchorY - radius };
      if (free(anchorX + offset, anchorY + radius)) return { x: anchorX + offset, y: anchorY + radius };
    }
    for (let offset = -radius + 1; offset < radius; offset++) {
      if (free(anchorX - radius, anchorY + offset)) return { x: anchorX - radius, y: anchorY + offset };
      if (free(anchorX + radius, anchorY + offset)) return { x: anchorX + radius, y: anchorY + offset };
    }
  }
  throw new Error("MAP_FULL");
}

// A caravan has no x/y of its own: it is a point on the line between its source city and its
// destination (city or market hub), placed by `progress`. This mirrors the client lerp at
// apps/client/src/map.ts:326-332 so the server judges range against the tile the player can
// actually see the caravan on. Keep the two in step; `undefined` here matches the client
// hiding a caravan whose endpoints no longer resolve.
export function caravanTile(caravan: Caravan, state: GameState, hubs: MarketHub[]): { x: number; y: number } | undefined {
  const from = state.cities.find(city => city.id === caravan.sourceCityId);
  const to = caravan.destinationCityId ? state.cities.find(city => city.id === caravan.destinationCityId) : hubs.find(hub => hub.id === caravan.destinationMarketId);
  if (!from || !to) return undefined;
  return { x: Math.round(from.x + (to.x - from.x) * caravan.progress), y: Math.round(from.y + (to.y - from.y) * caravan.progress) };
}

export class LogisticsRepository {
  private data: LogisticsData = { resourceNodes: [], depots: [], tradeRoutes: [], marketHubs: [], throughput: {}, caravans: [] };
  constructor(private readonly pool?: Pool, private readonly commands: CommandRegistry = new CommandRegistry()) {}

  /** Ports and mines are the authored map's, not this file's. They used to be four literals here —
   *  three mines and one hub — which is why `resource_nodes.region_id` was a fresh `randomUUID()`
   *  per node: there was no map to ask which province a mine was in.
   *
   *  Two things make a reseed converge now. Ids are derived from `(kingdom, tile)`, so the upsert
   *  in `persist()` finds the same row on every boot instead of inserting a 37th copy; and rows
   *  whose tile is no longer an anchor are pruned, which is how an edit to the map reaches a
   *  database that was seeded before it. */
  seed(state: GameState): void {
    if (!this.data.resourceNodes.length) this.data.resourceNodes = anchors.flatMap(anchor => anchor.kind !== "node" ? [] : [{
      id: worldId(state.kingdom.id, anchor.x, anchor.y),
      kingdomId: state.kingdom.id,
      regionId: anchorRegionId(state.kingdom.id, anchor.x, anchor.y),
      x: anchor.x, y: anchor.y,
      resourceType: anchor.resourceType,
      remaining: nodeCapacity, capacity: nodeCapacity,
      recoveryRate: recoveryRates[anchor.resourceType],
    } satisfies ResourceNode]);
    this.seedMarketHubs(state);
    this.syncDepots(state);
  }

  /** One port per quadrant. `findHubTile()` still stands behind each one: an authored tile can be
   *  taken by a city on a world loaded from the database, and a port that failed to place would be
   *  a quadrant with no market. The id follows the *authored* tile rather than where the port
   *  ended up, so the same port keeps the same row even if it had to shuffle. */
  private seedMarketHubs(state: GameState): void {
    if (this.data.marketHubs.length) return;
    const occupied = new Set([...state.cities, ...this.data.resourceNodes].map(item => `${item.x},${item.y}`));
    this.data.marketHubs = anchors.flatMap(anchor => {
      if (anchor.kind !== "market") return [];
      const tile = findHubTile(anchor.x, anchor.y, occupied);
      occupied.add(`${tile.x},${tile.y}`);
      return [{ id: worldId(state.kingdom.id, anchor.x, anchor.y), kingdomId: state.kingdom.id, name: anchor.name, x: tile.x, y: tile.y } satisfies MarketHub];
    });
  }

  syncDepots(state: GameState): void { this.data.depots = state.cities.filter(city => (city.buildings.road_depot ?? 0) > 0).map(city => ({ cityId: city.id, level: city.buildings.road_depot, capacity: depotCapacity(city.buildings.road_depot) } satisfies Depot)); }

  async load(state: GameState): Promise<void> {
    this.seed(state); if (!this.pool) return;
    try {
      const nodes = await this.pool.query<ResourceNode>(`SELECT id, kingdom_id AS "kingdomId", region_id AS "regionId", x, y, resource_type AS "resourceType", remaining::int, capacity::int, recovery_rate::int AS "recoveryRate" FROM resource_nodes WHERE kingdom_id = $1`, [state.kingdom.id]);
      // The map decides which mines and ports exist; the database only remembers what has happened
      // to them. Rows are matched by derived id, so a row seeded against an older world matches
      // nothing, is ignored here, and is deleted on the next save. Replacing the authored set with
      // whatever the table holds — which is what this used to do — would mean a database seeded
      // yesterday quietly kept the game on yesterday's map.
      const savedNodes = new Map(nodes.rows.map(row => [row.id, row]));
      for (const node of this.data.resourceNodes) {
        const row = savedNodes.get(node.id);
        // Only `remaining` is restored: capacity and recovery rate are balance numbers this file
        // owns, so tuning them in code is not overruled by a row written before the change.
        if (row) node.remaining = Math.max(0, Math.min(row.remaining, node.capacity));
      }
      const hubs = await this.pool.query<MarketHub>(`SELECT id, kingdom_id AS "kingdomId", name, x, y FROM market_hubs WHERE kingdom_id = $1`, [state.kingdom.id]);
      // A port keeps the tile it was actually placed on — `findHubTile` may have shuffled it off
      // the authored anchor — because that is the tile players have been marching caravans to.
      const savedHubs = new Map(hubs.rows.map(row => [row.id, row]));
      for (const hub of this.data.marketHubs) {
        const row = savedHubs.get(hub.id);
        if (row) { hub.x = row.x; hub.y = row.y; }
      }
      const routes = await this.pool.query<TradeRoute>(`SELECT id, kingdom_id AS "kingdomId", owner_player_id AS "ownerPlayerId", source_city_id AS "sourceCityId", destination_kind AS "destinationKind", destination_city_id AS "destinationCityId", destination_market_id AS "destinationMarketId", distance, travel_time_seconds AS "travelTimeSeconds", status FROM trade_routes WHERE kingdom_id = $1`, [state.kingdom.id]);
      this.data.tradeRoutes = routes.rows;
      const throughput = await this.pool.query<{ playerId: string; wood: number; stone: number; iron: number }>(`SELECT player_id AS "playerId", wood::int, stone::int, iron::int FROM economy_throughput WHERE season_id = $1`, [state.season.id]);
      for (const row of throughput.rows) this.data.throughput[row.playerId] = { wood: row.wood, stone: row.stone, iron: row.iron };
      const ids = state.players.map(player => player.id);
      if (ids.length) { const caravans = await this.pool.query<Caravan>(`SELECT id, route_id AS "routeId", owner_player_id AS "ownerPlayerId", source_city_id AS "sourceCityId", destination_kind AS "destinationKind", destination_city_id AS "destinationCityId", destination_market_id AS "destinationMarketId", progress, departed_at AS "departureAt", arrives_at AS "arrivesAt", escort_army_id AS "escortArmyId", ambush_seed AS "ambushSeed", status, frozen, frozen_at AS "frozenAt" FROM caravans WHERE owner_player_id = ANY($1)`, [ids]); this.data.caravans = caravans.rows; const cargo = await this.pool.query<{ caravanId: string; resourceType: string; amount: number }>(`SELECT caravan_id AS "caravanId", resource_type AS "resourceType", amount::int FROM caravan_cargo WHERE caravan_id = ANY($1)`, [caravans.rows.map(item => item.id)]); const byCaravan = new Map<string, Resources>(); for (const row of cargo.rows) { const current = byCaravan.get(row.caravanId) ?? { food: 0, wood: 0, stone: 0, iron: 0 }; if (row.resourceType in current) current[row.resourceType as keyof Resources] = row.amount; byCaravan.set(row.caravanId, current); } for (const caravan of this.data.caravans) caravan.cargo = byCaravan.get(caravan.id); }
    } catch (error) { console.warn("logistics load skipped", error instanceof Error ? error.message : error); }
  }

  /** Ports and mines are the only rows here whose existence the *map* decides, so they are the only
   *  ones that can go stale when the map is edited. Everything else below belongs to the players.
   *
   *  This runs before the upserts on purpose. A database seeded against the old world holds three
   *  mines and one port under `randomUUID()` keys at tiles the new map may reuse; deleting them
   *  first means the insert that follows lands on a clean tile instead of racing an index. */
  private async pruneWorldRows(client: PoolClient, state: GameState): Promise<void> {
    await client.query("DELETE FROM market_hubs WHERE kingdom_id = $1 AND NOT (id = ANY($2::uuid[]))", [state.kingdom.id, this.data.marketHubs.map(hub => hub.id)]);
    await client.query("DELETE FROM resource_nodes WHERE kingdom_id = $1 AND NOT (id = ANY($2::uuid[]))", [state.kingdom.id, this.data.resourceNodes.map(node => node.id)]);
  }

  async persist(client: PoolClient, state: GameState): Promise<void> {
    await this.pruneWorldRows(client, state);
    for (const hub of this.data.marketHubs) await client.query("INSERT INTO market_hubs (id, kingdom_id, name, x, y) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, x=EXCLUDED.x, y=EXCLUDED.y", [hub.id, hub.kingdomId, hub.name, hub.x, hub.y]);
    for (const node of this.data.resourceNodes) await client.query("INSERT INTO resource_nodes (id, kingdom_id, region_id, x, y, resource_type, remaining, capacity, recovery_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET remaining=EXCLUDED.remaining, capacity=EXCLUDED.capacity, recovery_rate=EXCLUDED.recovery_rate", [node.id,node.kingdomId,node.regionId,node.x,node.y,node.resourceType,node.remaining,node.capacity,node.recoveryRate]);
    for (const depot of this.data.depots) await client.query("INSERT INTO depots (city_id, level, capacity) VALUES ($1,$2,$3) ON CONFLICT (city_id) DO UPDATE SET level=EXCLUDED.level, capacity=EXCLUDED.capacity", [depot.cityId,depot.level,depot.capacity]);
    for (const [playerId, value] of Object.entries(this.data.throughput)) await client.query("INSERT INTO economy_throughput (season_id, player_id, wood, stone, iron) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (season_id, player_id) DO UPDATE SET wood=EXCLUDED.wood, stone=EXCLUDED.stone, iron=EXCLUDED.iron", [state.season.id, playerId, value.wood, value.stone, value.iron]);
    for (const route of this.data.tradeRoutes) await client.query("INSERT INTO trade_routes (id, kingdom_id, owner_player_id, source_city_id, destination_kind, destination_city_id, destination_market_id, distance, travel_time_seconds, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status", [route.id,route.kingdomId,route.ownerPlayerId,route.sourceCityId,route.destinationKind,route.destinationCityId,route.destinationMarketId ?? null,route.distance,route.travelTimeSeconds,route.status]);
    for (const caravan of this.data.caravans) { await client.query("INSERT INTO caravans (id, route_id, owner_player_id, source_city_id, destination_kind, destination_city_id, destination_market_id, progress, departed_at, arrives_at, escort_army_id, ambush_seed, status, frozen, frozen_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO UPDATE SET progress=EXCLUDED.progress, status=EXCLUDED.status, escort_army_id=EXCLUDED.escort_army_id, ambush_seed=EXCLUDED.ambush_seed, frozen=EXCLUDED.frozen, frozen_at=EXCLUDED.frozen_at, departed_at=EXCLUDED.departed_at, arrives_at=EXCLUDED.arrives_at", [caravan.id,caravan.routeId,caravan.ownerPlayerId,caravan.sourceCityId,caravan.destinationKind,caravan.destinationCityId,caravan.destinationMarketId ?? null,caravan.progress,caravan.departureAt,caravan.arrivesAt,caravan.escortArmyId ?? null,caravan.ambushSeed ?? null,caravan.status,caravan.frozen ?? false,caravan.frozenAt ?? null]); await client.query("DELETE FROM caravan_cargo WHERE caravan_id = $1", [caravan.id]); for (const key of ["food", ...resourceKeys] as const) await client.query("INSERT INTO caravan_cargo (caravan_id, resource_type, amount) VALUES ($1,$2,$3)", [caravan.id,key,caravan.cargo?.[key] ?? 0]); }
  }
  async save(state: GameState): Promise<void> {
    if (!this.pool) return; const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.pruneWorldRows(client, state);
      for (const hub of this.data.marketHubs) await client.query("INSERT INTO market_hubs (id, kingdom_id, name, x, y) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, x=EXCLUDED.x, y=EXCLUDED.y", [hub.id, hub.kingdomId, hub.name, hub.x, hub.y]);
      for (const node of this.data.resourceNodes) await client.query("INSERT INTO resource_nodes (id, kingdom_id, region_id, x, y, resource_type, remaining, capacity, recovery_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET remaining=EXCLUDED.remaining, capacity=EXCLUDED.capacity, recovery_rate=EXCLUDED.recovery_rate", [node.id,node.kingdomId,node.regionId,node.x,node.y,node.resourceType,node.remaining,node.capacity,node.recoveryRate]);
      for (const depot of this.data.depots) await client.query("INSERT INTO depots (city_id, level, capacity) VALUES ($1,$2,$3) ON CONFLICT (city_id) DO UPDATE SET level=EXCLUDED.level, capacity=EXCLUDED.capacity", [depot.cityId,depot.level,depot.capacity]);
      for (const [playerId, value] of Object.entries(this.data.throughput)) await client.query("INSERT INTO economy_throughput (season_id, player_id, wood, stone, iron) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (season_id, player_id) DO UPDATE SET wood=EXCLUDED.wood, stone=EXCLUDED.stone, iron=EXCLUDED.iron", [state.season.id, playerId, value.wood, value.stone, value.iron]);
      for (const route of this.data.tradeRoutes) await client.query("INSERT INTO trade_routes (id, kingdom_id, owner_player_id, source_city_id, destination_kind, destination_city_id, destination_market_id, distance, travel_time_seconds, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status", [route.id,route.kingdomId,route.ownerPlayerId,route.sourceCityId,route.destinationKind,route.destinationCityId,route.destinationMarketId ?? null,route.distance,route.travelTimeSeconds,route.status]);
      for (const caravan of this.data.caravans) { await client.query("INSERT INTO caravans (id, route_id, owner_player_id, source_city_id, destination_kind, destination_city_id, destination_market_id, progress, departed_at, arrives_at, escort_army_id, ambush_seed, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET progress=EXCLUDED.progress, status=EXCLUDED.status, escort_army_id=EXCLUDED.escort_army_id, ambush_seed=EXCLUDED.ambush_seed", [caravan.id,caravan.routeId,caravan.ownerPlayerId,caravan.sourceCityId,caravan.destinationKind,caravan.destinationCityId,caravan.destinationMarketId ?? null,caravan.progress,caravan.departureAt,caravan.arrivesAt,caravan.escortArmyId ?? null,caravan.ambushSeed ?? null,caravan.status]); await client.query("DELETE FROM caravan_cargo WHERE caravan_id = $1", [caravan.id]); for (const key of ["food", ...resourceKeys] as const) await client.query("INSERT INTO caravan_cargo (caravan_id, resource_type, amount) VALUES ($1,$2,$3)", [caravan.id,key,caravan.cargo?.[key] ?? 0]); }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); console.warn("logistics save skipped", error instanceof Error ? error.message : error); } finally { client.release(); }
  }

  snapshot(): LogisticsSnapshot { return { resourceNodes: this.data.resourceNodes, depots: this.data.depots, tradeRoutes: this.data.tradeRoutes, marketHubs: this.data.marketHubs, throughput: this.data.throughput }; }
  caravans(): Caravan[] { return this.data.caravans; }
  setPlayerFrozen(playerId: string, frozen: boolean, frozenAt: string | undefined, deltaMs: number, state: GameState): void { for (const caravan of this.data.caravans) { const owned = caravan.ownerPlayerId === playerId; const targetsPlayer = state.cities.find(city => city.id === caravan.destinationCityId)?.playerId === playerId; if (!owned && !targetsPlayer) continue; if (!frozen && deltaMs > 0) { if (caravan.departureAt) caravan.departureAt = new Date(Date.parse(caravan.departureAt) + deltaMs).toISOString(); if (caravan.arrivesAt) caravan.arrivesAt = new Date(Date.parse(caravan.arrivesAt) + deltaMs).toISOString(); } if (owned) { caravan.frozen = frozen; caravan.frozenAt = frozenAt; } } }
  capture(): LogisticsCapture { return { data: structuredClone(this.data) }; }
  restore(capture: LogisticsCapture): void { this.data = structuredClone(capture.data); }
  resetForSeason(state: GameState): void { this.data.caravans = []; this.data.tradeRoutes = []; this.data.throughput = {}; for (const node of this.data.resourceNodes) node.remaining = node.capacity; this.syncDepots(state); /* market hub survives season reset */ }
  private claim(commandId: string): boolean { return this.commands.claim(commandId); }

  harvest(commandId: string, nodeId: string, cityId: string, playerId: string, amount: number, state: GameState): string {
    assertActivePlayer(state, playerId);
    const city = state.cities.find(item => item.id === cityId); const node = this.data.resourceNodes.find(item => item.id === nodeId);
    if (!city || city.playerId !== playerId) throw new Error("CITY_ACCESS_DENIED");
    if (!node || node.remaining < amount) throw new Error("NODE_DEPLETED");
    if ((city.buildings.road_depot ?? 0) < 1) throw new Error("DEPOT_REQUIRED");
    if (Math.abs(city.x - node.x) + Math.abs(city.y - node.y) > gameRules.logistics.harvestRange) throw new Error("HARVEST_OUT_OF_RANGE");
    if (!this.claim(commandId)) return "already_processed";
    city.resources[node.resourceType] += amount; node.remaining -= amount;
    const produced = state.seasonMetrics.resourcesProduced[playerId] ??= { wood: 0, stone: 0, iron: 0 }; produced[node.resourceType] += amount;
    state.logisticsCounters.harvests[playerId] = (state.logisticsCounters.harvests[playerId] ?? 0) + 1;
    return "accepted";
  }

  createRoute(commandId: string, sourceCityId: string, destination: { kind: DestinationKind; id: string }, playerId: string, state: GameState): TradeRoute {
    assertActivePlayer(state, playerId);
    const source = state.cities.find(city => city.id === sourceCityId);
    let destinationCity: CityState | undefined;
    let destinationMarket: MarketHub | undefined;
    if (destination.kind === "city") {
      destinationCity = state.cities.find(city => city.id === destination.id);
      if (destinationCity) assertActiveTarget(state, destinationCity.playerId, destinationCity.frozen);
    } else {
      destinationMarket = this.data.marketHubs.find(hub => hub.id === destination.id);
    }
    if (!source || source.playerId !== playerId) throw new Error("CITY_ACCESS_DENIED");
    if (destination.kind === "city" && (!destinationCity || destinationCity.playerId !== playerId)) throw new Error("CITY_ACCESS_DENIED");
    if (!destinationCity && !destinationMarket) throw new Error("DESTINATION_NOT_FOUND");
    if ((source.buildings.road_depot ?? 0) < 1) throw new Error("DEPOT_REQUIRED");
    if (!this.claim(commandId)) throw new Error("already_processed");
    const era = destinationMarket ? { x: destinationMarket.x, y: destinationMarket.y } : { x: destinationCity!.x, y: destinationCity!.y };
    const distance = Math.abs(source.x - era.x) + Math.abs(source.y - era.y);
    const route: TradeRoute = { id: randomUUID(), kingdomId: state.kingdom.id, ownerPlayerId: playerId, sourceCityId, destinationKind: destination.kind, destinationCityId: destinationCity?.id ?? null, destinationMarketId: destinationMarket?.id, distance, travelTimeSeconds: Math.max(10, distance * 10), status: "active" };
    this.data.tradeRoutes.push(route); return route;
  }

  startCaravan(commandId: string, routeId: string, cargo: Resources, playerId: string, state: GameState): Caravan {
    assertActivePlayer(state, playerId);
    const route = this.data.tradeRoutes.find(item => item.id === routeId); const source = route && state.cities.find(city => city.id === route.sourceCityId); const depot = source && this.data.depots.find(item => item.cityId === source.id);
    if (route?.destinationKind === "city" && route.destinationCityId) { const destination = state.cities.find(city => city.id === route.destinationCityId); if (destination) assertActiveTarget(state, destination.playerId, destination.frozen); }
    if (!route || !source || route.ownerPlayerId !== playerId) throw new Error("ROUTE_ACCESS_DENIED"); if (!depot) throw new Error("DEPOT_REQUIRED");
    const total = resourceKeys.reduce((sum, key) => sum + cargo[key], 0); if (total <= 0 || total > depot.capacity) throw new Error("CARGO_CAPACITY_EXCEEDED");
    for (const key of resourceKeys) if (source.resources[key] < cargo[key]) throw new Error("INSUFFICIENT_RESOURCES");
    if (!this.claim(commandId)) throw new Error("already_processed");
    for (const key of resourceKeys) source.resources[key] -= cargo[key];
    const now = Date.now(); const caravan: Caravan = { id: randomUUID(), ownerPlayerId: playerId, sourceCityId: route.sourceCityId, destinationKind: route.destinationKind, destinationCityId: route.destinationCityId, destinationMarketId: route.destinationMarketId, progress: 0, status: "moving", routeId: route.id, cargo, departureAt: new Date(now).toISOString(), arrivesAt: new Date(now + route.travelTimeSeconds * 1000).toISOString() };
    this.data.caravans.push(caravan); return caravan;
  }

  escort(commandId: string, caravanId: string, armyId: string, playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    const caravan = this.data.caravans.find(item => item.id === caravanId);
    const army = state.armies.find(item => item.id === armyId);
    if (!caravan || caravan.ownerPlayerId !== playerId) throw new Error("CARAVAN_ACCESS_DENIED");
    if (!army || army.ownerPlayerId !== playerId) throw new Error("ARMY_ACCESS_DENIED");
    if (caravan.status !== "moving") throw new Error("CARAVAN_NOT_MOVING");
    if (!this.claim(commandId)) return "already_processed";
    caravan.escortArmyId = army.id;
    return "accepted";
  }

  ambush(commandId: string, caravanId: string, attackerPlayerId: string, state: GameState, diplomacy?: any): { status: "ambushed" | "escaped"; seed: number; lossRatio: number } {
    assertActivePlayer(state, attackerPlayerId);
    const caravan = this.data.caravans.find(item => item.id === caravanId);
    if (caravan) assertActiveTarget(state, caravan.ownerPlayerId, caravan.frozen);
    if (!caravan || caravan.status !== "moving") throw new Error("CARAVAN_NOT_MOVING");
    if (caravan.ownerPlayerId === attackerPlayerId) throw new Error("INVALID_ATTACKER");
    // An ambush used to cost nothing but a command: no army, no distance, so any active player
    // could strip 60% of any cargo anywhere on the map and escorts protected nothing. Require a
    // live army of the attacker's within `ambushRange` of where the caravan is right now. The
    // Manhattan test is inline to match the HARVEST_OUT_OF_RANGE check above.
    const tile = caravanTile(caravan, state, this.data.marketHubs);
    if (!tile || !state.armies.some(army => army.ownerPlayerId === attackerPlayerId && !army.frozen && army.strength > 0 && Math.abs(army.x - tile.x) + Math.abs(army.y - tile.y) <= ambushRange)) throw new Error("AMBUSH_OUT_OF_RANGE");
    const seed = Array.from(commandId).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
    if (!this.claim(commandId)) throw new Error("already_processed");
    if (diplomacy) {
      const violation = diplomacy.checkAttackViolation(attackerPlayerId, caravan.ownerPlayerId, state);
      if (violation) diplomacy.breakTreaty(commandId + "-violate", violation.id, attackerPlayerId, state);
    }
    const escorted = Boolean(caravan.escortArmyId);
    const success = (seed % 100) < (escorted ? 25 : 65);
    caravan.ambushSeed = seed;
    if (!success) return { status: "escaped", seed, lossRatio: 0 };
    caravan.status = "ambushed";
    const lossRatio = escorted ? 0.25 : 0.6;
    if (caravan.cargo) for (const key of resourceKeys) caravan.cargo[key] = Math.floor(caravan.cargo[key] * (1 - lossRatio));
    return { status: "ambushed", seed, lossRatio };
  }
  tick(state: GameState): boolean {
    let changed = false; const now = Date.now();
    for (const node of this.data.resourceNodes) { const recovered = Math.min(node.capacity, node.remaining + node.recoveryRate); if (recovered !== node.remaining) { node.remaining = recovered; changed = true; } }
    for (const caravan of this.data.caravans.filter(item => item.status === "moving" && !item.frozen && state.players.find(player => player.id === item.ownerPlayerId)?.status !== "banned")) {
      const route = this.data.tradeRoutes.find(item => item.id === caravan.routeId); if (!route || !caravan.departureAt || !caravan.arrivesAt) continue;
      const targetCity = caravan.destinationKind === "city" ? state.cities.find(city => city.id === caravan.destinationCityId) : undefined; if (targetCity?.frozen || (targetCity && state.players.find(player => player.id === targetCity.playerId)?.status === "banned")) continue;
      caravan.progress = Math.min(1, (now - Date.parse(caravan.departureAt)) / (Date.parse(caravan.arrivesAt) - Date.parse(caravan.departureAt)));
      if (now >= Date.parse(caravan.arrivesAt)) {
        const throughput = this.data.throughput[caravan.ownerPlayerId] ??= emptyThroughput();
        if (caravan.cargo) {
          if (caravan.destinationKind === "market") {
            // Export: cargo is consumed by the hub; counts as throughput (Economy Score) only, once per caravan.
            for (const key of resourceKeys) throughput[key] += caravan.cargo[key];
            const exported = state.logisticsCounters.exports[caravan.ownerPlayerId] ??= { wood: 0, stone: 0, iron: 0 };
            for (const key of resourceKeys) exported[key] += caravan.cargo[key];
          } else {
            const destination = state.cities.find(city => city.id === caravan.destinationCityId);
            if (destination) for (const key of resourceKeys) destination.resources[key] += caravan.cargo[key];
            for (const key of resourceKeys) throughput[key] += caravan.cargo[key];
          }
        }
        caravan.status = "delivered";
      }
      changed = true;
    }
    return changed;
  }
}


import { Pool, type PoolClient } from "pg";
import { factions, gameRules, overallScore, militaryScore, diplomacyScore, type FactionId, type Scores } from "@kingdoms/shared";
import { createHash, randomUUID } from "node:crypto";
import type { CityState, GameState, Player } from "./types.js";
import { config } from "./config.js";
import { LogisticsRepository } from "./logistics.js";
import { EventLedger } from "./event-ledger.js";
import { CombatRepository } from "./combat.js";
import { DiplomacyRepository } from "./diplomacy.js";
import { EspionageRepository } from "./espionage.js";
import { WorldEventEngine } from "./world-events.js";
import { RaiderEngine } from "./raiders.js";
import { OnboardingRepository } from "./onboarding.js";
import { buildLegacyRecords, hardReset, reputationCosmetic, seasonResetTemplate } from "./season-reset.js";
import { buildSeasonAnalytics } from "./analytics.js";

// Prices are `gameRules.buildings` — the same table the client reads to draw the
// build menu — reshaped into the flat form `startBuild` charges from. This used to
// be a second literal holding the same four rows, which meant a price change in
// shared silently left the server charging the old cost while the UI promised the
// new one. Deriving it makes that drift unrepresentable; `store.test.ts` asserts
// the two still agree.
const buildingCosts: Record<string, { wood: number; stone: number; iron: number; food: number; seconds: number }> =
  Object.fromEntries(Object.values(gameRules.buildings).map(building => [building.id, { ...building.cost, seconds: building.durationSeconds }]));
function newSeason(): GameState["season"] { const now = Date.now(); return { id: randomUUID(), status: "ACTIVE", startsAt: new Date(now).toISOString(), endsAt: new Date(now + config.seasonDurationMs).toISOString() }; }
function makeCity(playerId: string, name: string, x: number, y: number): CityState { return { id: randomUUID(), playerId, name, x, y, resources: { food: 0, wood: 500, stone: 500, iron: 500 }, buildings: { town_hall: 1 }, queues: [], starterGranted: true }; }

// Deterministic placement inside [2..17]x[2..17]: first valid tile in row-major
// order — free of entities, at least 3 Manhattan from other cities, and within
// 2 Manhattan of the market hub or a resource node. Throws when the map is full.
function cityPlacement(state: GameState, logistics: LogisticsRepository): { x: number; y: number } {
  const { minX, maxX, minY, maxY, minDistanceBetweenCities, maxDistanceToHubOrNode } = gameRules.cityPlacement;
  const entities = [
    ...state.cities.map(city => ({ x: city.x, y: city.y })),
    ...logistics.snapshot().resourceNodes.map(node => ({ x: node.x, y: node.y })),
    ...logistics.snapshot().marketHubs.map(hub => ({ x: hub.x, y: hub.y })),
  ];
  const anchors = [
    ...logistics.snapshot().marketHubs,
    ...logistics.snapshot().resourceNodes,
  ];
  const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (entities.some(entity => entity.x === x && entity.y === y)) continue;
      if (state.cities.some(city => manhattan(city, { x, y }) < minDistanceBetweenCities)) continue;
      const nearAnchor = anchors.some(anchor => manhattan(anchor, { x, y }) <= maxDistanceToHubOrNode);
      if (!nearAnchor) continue;
      return { x, y };
    }
  }
  throw new Error("KINGDOM_FULL");
}
export function createSeedState(): GameState {
  const kingdomId = randomUUID(); const first: Player = { id: randomUUID(), displayName: "Lan", factionId: "meridian", kingdomId, crossSeasonReputation: 0 }; const second: Player = { id: randomUUID(), displayName: "Minh", factionId: "bastion", kingdomId, crossSeasonReputation: 0 };
  const firstCity = makeCity(first.id, "Meridian Outpost", 8, 8); const secondCity = makeCity(second.id, "Bastion Gate", 13, 11);
  return { kingdom: { id: kingdomId, name: "Meridian Kingdom" }, season: newSeason(), players: [first, second], cities: [firstCity, secondCity], caravans: [], armies: [{ id: randomUUID(), ownerType: "player", ownerPlayerId: first.id, x: 9, y: 8, unitType: "infantry", strength: 100, morale: 100, formation: "line", supply: 100, lastSupplyAt: new Date().toISOString() }, { id: randomUUID(), ownerType: "player", ownerPlayerId: second.id, x: 14, y: 11, unitType: "archer", strength: 100, morale: 100, formation: "line", supply: 100, lastSupplyAt: new Date().toISOString() }], heroes: [], scores: {}, seasonHistory: [], legacyRecords: [], processedCommands: [], battleReports: [], terrainMap: {}, militaryThroughput: {}, alliances: [], allianceVotes: [], treaties: [], diplomacyThroughput: {}, spyMissions: [], worldEvents: [], counterIntelActive: {}, seasonMetrics: { resourcesProduced: {} }, raiderSpawnState: { sequence: 0 }, logisticsCounters: { exports: {}, harvests: {} } };
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
  constructor() { this.pool = config.databaseUrl ? new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 1500 }) : undefined; this.logistics = new LogisticsRepository(this.pool); this.combat = new CombatRepository(this.pool); this.diplomacy = new DiplomacyRepository(this.pool); this.espionage = new EspionageRepository(this.pool); this.ledger = new EventLedger(this.pool); this.worldEvents = new WorldEventEngine(this.combat, this.ledger); this.raiders = new RaiderEngine(this.combat, this.ledger); this.onboarding = new OnboardingRepository(this.pool); this.logistics.seed(this.state); this.combat.seed(this.state); this.diplomacy.seed(this.state); this.worldEvents.seed(this.state); this.raiders.seed(this.state); }
  async load(): Promise<void> { if (this.pool) { try { const result = await this.pool.query<{ state: GameState }>("SELECT state FROM game_state WHERE state_key = $1", ["kingdom"]); if (result.rows[0]?.state) { const saved = result.rows[0].state; this.state = { ...saved, players: saved.players.map(player => ({ ...player, crossSeasonReputation: player.crossSeasonReputation ?? 0 })), armies: (saved.armies ?? []).map(army => ({ ...army, ownerType: army.ownerType ?? "player", ownerPlayerId: army.ownerPlayerId ?? null })), heroes: saved.heroes ?? [], caravans: [], battleReports: saved.battleReports ?? [], terrainMap: saved.terrainMap ?? {}, militaryThroughput: saved.militaryThroughput ?? {}, alliances: saved.alliances ?? [], allianceVotes: saved.allianceVotes ?? [], treaties: saved.treaties ?? [], diplomacyThroughput: saved.diplomacyThroughput ?? {}, spyMissions: saved.spyMissions ?? [], worldEvents: (saved.worldEvents ?? []).map(event => ({ ...event, seed: event.seed ?? 0 })), counterIntelActive: saved.counterIntelActive ?? {}, seasonMetrics: saved.seasonMetrics ?? { resourcesProduced: {} }, raiderSpawnState: saved.raiderSpawnState ?? { sequence: 0 }, logisticsCounters: saved.logisticsCounters ?? { exports: {}, harvests: {} } }; const reps = await this.pool.query<{ player_id: string; score: number }>("SELECT player_id, score FROM player_reputation WHERE player_id = ANY($1::uuid[])", [this.state.players.map(player => player.id)]); for (const row of reps.rows) { const player = this.findPlayer(row.player_id); if (player) player.crossSeasonReputation = row.score; } } } catch (error) { console.warn("database load skipped", error instanceof Error ? error.message : error); } } this.logistics.seed(this.state); this.combat.seed(this.state); await this.logistics.load(this.state); await this.combat.load(this.state); await this.diplomacy.load(this.state); await this.espionage.load(this.state); this.worldEvents.seed(this.state); this.raiders.seed(this.state); await this.onboarding.load(this.state); await this.ledger.load(); }
  // Tick-resolved battles and auto-canceled pursuit orders for the HTTP layer
  // to broadcast over WebSocket; cleared by takeTick* once read.
  takeTickBattleReports(): ReturnType<CombatRepository["drainReports"]> { const out = this.tickReportBatch; this.tickReportBatch = []; return out; }
  takeTickCancellations(): ReturnType<CombatRepository["drainCancellations"]> { const out = this.tickCancelBatch; this.tickCancelBatch = []; return out; }
  async save(): Promise<void> {
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
    let previousState = structuredClone(this.state); let previousLogistics = this.logistics.capture(); let previousEspionage = this.espionage.capture(); let previousCombat = this.combat.capture(); let previousOnboarding = this.onboarding.capture(); let appended: ReturnType<EventLedger["append"]> | undefined;
    if (!this.pool) { try { const result = action(); appended = this.ledger.append({ ...event, payload: result }); return { alreadyApplied: false, result }; } catch (error) { this.state = previousState; this.logistics.restore(previousLogistics); this.espionage.restore(previousEspionage); this.combat.restore(previousCombat); this.onboarding.restore(previousOnboarding); if (appended) this.ledger.discard(appended.id); throw error; } }
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`state:${this.state.kingdom.id}`]); await this.load(); previousState = structuredClone(this.state); previousLogistics = this.logistics.capture(); previousEspionage = this.espionage.capture(); previousCombat = this.combat.capture(); previousOnboarding = this.onboarding.capture(); const actor = await client.query("SELECT status FROM players WHERE id=$1", [event.actorPlayerId]); if (actor.rows[0]?.status === "banned") throw new Error("ACCOUNT_BANNED"); if (event.commandId) { const existing = await client.query("SELECT 1 FROM event_ledger WHERE command_id=$1", [event.commandId]); if (existing.rowCount) { await client.query("ROLLBACK"); return { alreadyApplied: true, result: "already_processed" }; } } const result = action(); appended = this.ledger.append({ ...event, payload: result }); await this.persistState(client); await client.query("COMMIT"); this.ledger.markPersisted(); return { alreadyApplied: false, result }; }
    catch (error) { await client.query("ROLLBACK"); this.state = previousState; this.logistics.restore(previousLogistics); this.espionage.restore(previousEspionage); this.combat.restore(previousCombat); this.onboarding.restore(previousOnboarding); if (appended) this.ledger.discard(appended.id); throw error; } finally { client.release(); }
  }
  get snapshot(): GameState { return this.state; } findPlayer(id: string): Player | undefined { return this.state.players.find(player => player.id === id); } findCity(id: string): CityState | undefined { return this.state.cities.find(city => city.id === id); }
  get databasePool(): Pool | undefined { return this.pool; }
  async close(): Promise<void> { if (this.pool && !this.pool.ended) { await this.pool.end(); } }
  createRegisteredPlayer(displayName: string, factionId: FactionId): { player: Player; city: CityState } { const player: Player = { id: randomUUID(), displayName, factionId, kingdomId: this.state.kingdom.id, crossSeasonReputation: 0, status: "active" }; const placement = cityPlacement(this.state, this.logistics); const city = makeCity(player.id, `${factions[factionId].name} City`, placement.x, placement.y); this.state.players.push(player); this.state.cities.push(city); this.recalculateScores(); return { player, city }; }
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
      await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`state:${this.state.kingdom.id}`]); await this.load(); player = this.findPlayer(playerId)!; previousState = structuredClone(this.state); previousLogistics = this.logistics.capture(); previousEspionage = this.espionage.capture(); const locked = await client.query("SELECT p.status,u.banned_at FROM players p LEFT JOIN users u ON u.id=p.user_id WHERE p.id=$1 FOR UPDATE OF p", [playerId]);
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
  addDevPlayer(displayName: string, factionId: FactionId): Player { const existing = this.state.players.find(player => player.displayName.toLowerCase() === displayName.toLowerCase()); if (existing) return existing; const player: Player = { id: randomUUID(), displayName, factionId, kingdomId: this.state.kingdom.id, crossSeasonReputation: 0 }; const placement = cityPlacement(this.state, this.logistics); this.state.players.push(player); this.state.cities.push(makeCity(player.id, `${factions[factionId].name} City`, placement.x, placement.y)); return player; }
  startBuild(playerId: string, commandId: string, cityId: string, buildingId: string, queueType: "build" | "research"): string { if (this.state.processedCommands.includes(commandId)) return "already_processed"; if (this.isPlayerFrozen(playerId)) throw new Error("ACCOUNT_BANNED"); const city = this.findCity(cityId); if (!city || city.playerId !== playerId) throw new Error("CITY_ACCESS_DENIED"); if (city.frozen) throw new Error("ACCOUNT_BANNED"); const limit = queueType === "build" ? 2 : 1; if (city.queues.filter(queue => queue.type === queueType).length >= limit) throw new Error("QUEUE_LIMIT_REACHED"); const cost = buildingCosts[buildingId]; if (!cost) throw new Error("UNKNOWN_BUILDING"); for (const key of ["food", "wood", "stone", "iron"] as const) if (city.resources[key] < cost[key]) throw new Error("INSUFFICIENT_RESOURCES"); for (const key of ["food", "wood", "stone", "iron"] as const) city.resources[key] -= cost[key]; const now = Date.now(); city.queues.push({ id: randomUUID(), type: queueType, buildingId, targetLevel: (city.buildings[buildingId] ?? 0) + 1, startedAt: new Date(now).toISOString(), completesAt: new Date(now + cost.seconds * 1000).toISOString() }); this.state.processedCommands.push(commandId); return "accepted"; }
  tick(): boolean { let changed = false; for (const city of this.state.cities) if (!city.frozen && this.findPlayer(city.playerId)?.status !== "banned") for (const queue of city.queues.filter(item => Date.parse(item.completesAt) <= Date.now())) { city.buildings[queue.buildingId] = queue.targetLevel; city.queues = city.queues.filter(item => item.id !== queue.id); changed = true; } changed = this.applySupplyZones(Date.now()) || changed; this.logistics.syncDepots(this.state); const logisticsChanged = this.logistics.tick(this.state); const combatChanged = this.combat.tick(this.state, this.diplomacy); const diplomacyChanged = this.diplomacy.tick(this.state); const espionageChanged = this.espionage.tick(this.state); const worldEventsChanged = this.worldEvents.tick(this.state); const raiderChanged = this.raiders.tick(this.state); changed = logisticsChanged || combatChanged || diplomacyChanged || espionageChanged || worldEventsChanged || raiderChanged || changed; this.tickReportBatch = this.combat.drainReports(); const cancellations = this.combat.drainCancellations(); this.tickCancelBatch = cancellations; for (const report of this.tickReportBatch) if (report.attacker.playerId || report.defender.playerId) this.ledger.append({ eventType: "combat.resolved", aggregateType: "combat", aggregateId: report.id, payload: { seed: report.seed, victor: report.victor, attackerArmyId: report.attacker.armyId, defenderArmyId: report.defender.armyId, attackerPlayerId: report.attacker.playerId ?? null, defenderPlayerId: report.defender.playerId ?? null, input: { seed: report.seed }, result: report } }); for (const cancellation of cancellations) this.ledger.append({ eventType: "attack_order.canceled", aggregateType: "army", aggregateId: cancellation.armyId, payload: { orderId: cancellation.orderId, targetArmyId: cancellation.targetArmyId, reason: cancellation.reason } }); if (logisticsChanged) this.ledger.append({ eventType: "logistics.tick", aggregateType: "kingdom", aggregateId: this.state.kingdom.id, payload: { caravans: this.logistics.caravans().map(caravan => ({ id: caravan.id, status: caravan.status, progress: caravan.progress, ambushSeed: caravan.ambushSeed })) } }); if (diplomacyChanged) this.ledger.append({ eventType: "diplomacy.tick", aggregateType: "kingdom", aggregateId: this.state.kingdom.id, payload: { alliances: this.state.alliances.map(alliance => ({ id: alliance.id, leaderPlayerId: alliance.leaderPlayerId, leaderTermStartedAt: alliance.leaderTermStartedAt })), votes: this.state.allianceVotes.map(vote => ({ id: vote.id, status: vote.status })) } }); if (this.onboarding.verify(this.state)) changed = true; this.recalculateScores(); return changed; }
  // `militaryThroughput` also tracks `defeats`, `strengthDestroyed` and `strengthLost`
  // (written in `combat.ts`, reported by `buildSeasonAnalytics`), but `militaryScore`
  // reads only these four — losses cost a player nothing on the scoreboard today.
  // That is a design decision belonging to `docs/GAME-DESIGN.md`, not a bug to patch
  // here, so the zero-fallback stops claiming values the formula never looks at.
  recalculateScores(): void { for (const player of this.state.players) { const delivered = this.logistics.snapshot().throughput[player.id]; const stats = this.state.militaryThroughput[player.id] ?? { victories: 0, draws: 0, tilesControlled: 0, successfulDefenses: 0 }; const economy = Math.min(1000, Math.floor(((delivered?.wood ?? 0) + (delivered?.stone ?? 0) + (delivered?.iron ?? 0) * 2) / 2)); const military = militaryScore(stats); const scores = { military, economy, diplomacy: diplomacyScore(this.diplomacy.getStats(player.id, this.state)), overall: 0 } satisfies Scores; scores.overall = overallScore(scores); this.state.scores[player.id] = scores; } }
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
      let rate: number = outsidePerMinute;
      if (ownCity) {
        if (manhattan(ownCity, army) <= insideCityRadius) rate = insideCityPerMinute;
        const depot = this.logistics.snapshot().depots.find(depot => depot.cityId === ownCity.id);
        if (depot && manhattan(ownCity, army) <= depotRadiusBase + depotRadiusPerLevel * depot.level) rate = Math.max(rate, atDepotPerMinute);
      }
      const supplyBefore = army.supply;
      const next = Math.min(max, Math.max(min, supplyBefore + rate * elapsedMinutes));
      if (next !== supplyBefore) { army.supply = next; changed = true; }
      // Attrition applies per minute, so only the minutes supply actually ends
      // below the threshold count — not the whole offline window. With a linear
      // rate, the crossing minute is floor((threshold - supplyBefore) / rate)
      // minutes into the window (rate < 0 by definition of a draining zone).
      let minutesBelow = 0;
      if (rate < 0) {
        if (supplyBefore < attritionBelowSupply) minutesBelow = elapsedMinutes;
        else minutesBelow = Math.max(0, elapsedMinutes - Math.floor((attritionBelowSupply - supplyBefore) / rate));
      }
      if (minutesBelow > 0) {
        if (army.strength > 1) { army.strength = Math.max(1, army.strength - attritionStrengthPerMinute * minutesBelow); changed = true; }
        if (army.morale > 0) { army.morale = Math.max(0, army.morale - attritionMoralePerMinute * minutesBelow); changed = true; }
      }
    }
    return changed;
  }
  private prepareFinalization(now: number) { const seasonId = this.state.season.id; this.state.season.status = "FINALIZING"; this.recalculateScores(); const rankings = this.state.players.map(player => ({ playerId: player.id, scores: this.state.scores[player.id], overall: this.state.scores[player.id].overall })).sort((a, b) => b.overall - a.overall || a.playerId.localeCompare(b.playerId)).map((item, index) => ({ ...item, rank: index + 1 })); const closedAt = new Date(now).toISOString(); const legacy = buildLegacyRecords(this.state, seasonId, rankings); const analytics = buildSeasonAnalytics(this.state, seasonId, rankings); this.state.seasonHistory.push({ seasonId, rankings, closedAt }); this.state.legacyRecords.push(...legacy); const fullSnapshot = { ...structuredClone(this.state), logistics: structuredClone(this.logistics.snapshot()), caravans: structuredClone(this.logistics.caravans()), resetTemplate: seasonResetTemplate }; return { seasonId, rankings, closedAt, legacy, analytics, fullSnapshot, checksum: createHash("sha256").update(JSON.stringify(fullSnapshot)).digest("hex") }; }
  async finalizeIfDue(options: { force?: boolean; reason?: string } = {}): Promise<boolean> { const now = Date.now(); if (this.state.season.status !== "ACTIVE" || (!options.force && Date.parse(this.state.season.endsAt) > now)) return false; const previousState = structuredClone(this.state); const previousLogistics = this.logistics.capture(); const previousEspionage = this.espionage.capture(); if (!this.pool) { const result = this.prepareFinalization(now); hardReset(this.state, newSeason()); this.logistics.resetForSeason(this.state); this.espionage.resetForSeason(); this.ledger.append({ eventType: "season.finalized", aggregateType: "season", aggregateId: result.seasonId, payload: { checksum: result.checksum, resetTemplate: seasonResetTemplate } }); return true; } return this.finalizeInDatabase(now, options, previousState, previousLogistics, previousEspionage); }
  private async finalizeInDatabase(now: number, options: { force?: boolean; reason?: string }, previousState: GameState, previousLogistics: ReturnType<LogisticsRepository["capture"]>, previousEspionage: ReturnType<EspionageRepository["capture"]>): Promise<boolean> { const client = await this.pool!.connect(); try { await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`state:${this.state.kingdom.id}`]); await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${this.state.kingdom.id}:${this.state.season.id}`]); await client.query("INSERT INTO seasons (id, kingdom_id, status, starts_at, ends_at, config) VALUES ($1,$2,'ACTIVE',$3,$4,$5) ON CONFLICT (id) DO NOTHING", [this.state.season.id, this.state.kingdom.id, this.state.season.startsAt, this.state.season.endsAt, JSON.stringify({ resetTemplate: seasonResetTemplate })]); const claimed = await client.query("UPDATE seasons SET status='FINALIZING' WHERE id=$1 AND finalized_at IS NULL AND status IN ('ACTIVE','FINALIZING') RETURNING id", [this.state.season.id]); if (!claimed.rowCount) { await client.query("ROLLBACK"); return false; } const result = this.prepareFinalization(now); await this.persistSeasonResult(client, result); hardReset(this.state, newSeason()); this.logistics.resetForSeason(this.state); this.espionage.resetForSeason(); await this.persistSeasonReset(client, result.seasonId, result.closedAt, options); this.ledger.append({ eventType: "season.finalized", aggregateType: "season", aggregateId: result.seasonId, payload: { checksum: result.checksum, resetTemplate: seasonResetTemplate } }); await this.persistState(client); await client.query("COMMIT"); this.ledger.markPersisted(); return true; } catch (error) { await client.query("ROLLBACK"); this.state = previousState; this.logistics.restore(previousLogistics); this.espionage.restore(previousEspionage); throw error; } finally { client.release(); } }
  private async persistSeasonResult(client: PoolClient, result: ReturnType<GameStore["prepareFinalization"]>): Promise<void> { await client.query("INSERT INTO season_snapshots (season_id, snapshot, checksum) VALUES ($1,$2,$3) ON CONFLICT (season_id) DO NOTHING", [result.seasonId, JSON.stringify(result.fullSnapshot), result.checksum]); for (const ranking of result.rankings) await client.query("INSERT INTO season_rankings (season_id, player_id, overall_score, military_score, economy_score, diplomacy_score, rank) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (season_id, player_id) DO NOTHING", [result.seasonId, ranking.playerId, ranking.overall, ranking.scores.military, ranking.scores.economy, ranking.scores.diplomacy, ranking.rank]); for (const record of result.legacy) await client.query("INSERT INTO legacy_records (id, owner_id, season_id, record_type, payload, template_version) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING", [record.id, record.ownerId, record.seasonId, record.recordType, JSON.stringify(record.payload), seasonResetTemplate]); for (const event of result.analytics) await client.query("INSERT INTO analytics_events (id, season_id, player_id, event_type, payload) VALUES ($1,$2,$3,$4,$5)", [event.id, event.seasonId, event.playerId ?? null, event.eventType, JSON.stringify(event.payload)]); }
  private async persistSeasonReset(client: PoolClient, closedSeasonId: string, closedAt: string, options: { force?: boolean; reason?: string }): Promise<void> { for (const player of this.state.players) await client.query("INSERT INTO player_reputation (player_id, score) VALUES ($1,$2) ON CONFLICT (player_id) DO UPDATE SET score=EXCLUDED.score", [player.id, player.crossSeasonReputation]); const playerIds = this.state.players.map(player => player.id); if (playerIds.length) { await client.query("DELETE FROM caravan_cargo WHERE caravan_id IN (SELECT id FROM caravans WHERE owner_player_id = ANY($1::uuid[]))", [playerIds]); await client.query("DELETE FROM caravans WHERE owner_player_id = ANY($1::uuid[])", [playerIds]); await client.query("DELETE FROM spy_cooldowns WHERE player_id = ANY($1::uuid[])", [playerIds]); await client.query("DELETE FROM counter_intel_active WHERE player_id = ANY($1::uuid[])", [playerIds]); } await client.query("DELETE FROM trade_routes WHERE kingdom_id=$1", [this.state.kingdom.id]); await client.query("DELETE FROM diplomacy_treaties WHERE kingdom_id=$1", [this.state.kingdom.id]); await client.query("DELETE FROM espionage_actions WHERE kingdom_id=$1", [this.state.kingdom.id]); await client.query("DELETE FROM world_events WHERE kingdom_id=$1", [this.state.kingdom.id]); for (const city of this.state.cities) { await client.query("DELETE FROM build_queues WHERE city_id=$1", [city.id]); await client.query("DELETE FROM city_buildings WHERE city_id=$1", [city.id]); await client.query("INSERT INTO city_buildings (city_id, building_id, level) VALUES ($1,'town_hall',1)", [city.id]); await client.query("INSERT INTO city_resources (city_id, food, wood, stone, iron) VALUES ($1,0,500,500,500) ON CONFLICT (city_id) DO UPDATE SET food=0, wood=500, stone=500, iron=500, updated_at=now()", [city.id]); } await client.query("UPDATE seasons SET status='CLOSED', finalized_at=$2 WHERE id=$1", [closedSeasonId, closedAt]); await client.query("INSERT INTO seasons (id, kingdom_id, status, starts_at, ends_at, config) VALUES ($1,$2,'ACTIVE',$3,$4,$5)", [this.state.season.id, this.state.kingdom.id, this.state.season.startsAt, this.state.season.endsAt, JSON.stringify({ resetTemplate: seasonResetTemplate })]); if (options.force) await client.query("INSERT INTO admin_actions (id, actor_id, action_type, reason) VALUES ($1,NULL,'season.close',$2)", [randomUUID(), options.reason ?? "manual close"]); }
  archiveForPlayer(playerId: string) { const latest = this.state.seasonHistory.at(-1); const player = this.findPlayer(playerId); if (!player) throw new Error("PLAYER_NOT_FOUND"); return { seasons: this.state.seasonHistory.map(history => ({ seasonId: history.seasonId, closedAt: history.closedAt, rankings: history.rankings.map(ranking => ({ ...ranking, displayName: this.findPlayer(ranking.playerId)?.displayName ?? "Unknown", factionId: this.findPlayer(ranking.playerId)?.factionId ?? "meridian" })) })), profile: { crossSeasonReputation: player.crossSeasonReputation, ...reputationCosmetic(player.crossSeasonReputation), crown: Boolean(latest?.rankings.some(ranking => ranking.playerId === playerId && ranking.rank <= 3)), legacyRecords: this.state.legacyRecords.filter(record => record.ownerId === playerId).map(({ id, seasonId, recordType, payload }) => ({ id, seasonId, recordType, payload })) } }; }
}






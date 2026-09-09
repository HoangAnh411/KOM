import type { Army, Commander, FactionId, Hero, Resources, Scores, BattleReport, TerrainType, SpyMission, WorldEvent, AllianceVote, BuildingPlacement, CityRotation, Exploration, EquippedCosmetics, OwnedCosmetic, FormationPreset, TrainingQueue, HospitalQueue, TroopReserve, TechnologyProgress, ResearchQueue, CampaignProgress, OperationRun } from "@kingdoms/shared";

export type SeasonStatus = "SCHEDULED" | "ACTIVE" | "FINALIZING" | "CLOSED";
export type QueueType = "build" | "research";

export type Player = { id: string; displayName: string; factionId: FactionId; kingdomId: string; crossSeasonReputation: number; userId?: string; status?: "active" | "banned"; bannedAt?: string };
export type QueueItem = { id: string; type: QueueType; buildingId: string; targetLevel: number; startedAt: string; completesAt: string; plotX?: number; plotY?: number; plotRotation?: CityRotation };
export type CityState = { id: string; playerId: string; name: string; x: number; y: number; resources: Resources; buildings: Record<string, number>; cityLayoutVersion: 2; cityLayoutRevision: number; buildingPlots: BuildingPlacement[]; queues: QueueItem[]; productionAt?: string; starterGranted?: boolean; frozen?: boolean; frozenAt?: string };
export type CaravanState = { id: string; ownerPlayerId: string; sourceCityId: string; destinationCityId: string; progress: number; status: "moving" | "delivered" | "ambushed"; routeId?: string; cargo?: Resources; departureAt?: string; arrivesAt?: string; escortArmyId?: string; ambushSeed?: number; frozen?: boolean; frozenAt?: string };
export type SeasonState = { id: string; status: SeasonStatus; startsAt: string; endsAt: string; worldId?: string };
export type LegacyRecord = { id: string; ownerId: string; seasonId: string; recordType: string; payload: unknown };
export type MilitaryStats = { victories: number; defeats: number; draws: number; strengthDestroyed: number; strengthLost: number; tilesControlled: number; successfulDefenses: number };
export type SeasonMetrics = { resourcesProduced: Record<string, { wood: number; stone: number; iron: number }> };
export type CosmeticAccount = { badges: number; owned: OwnedCosmetic[]; equipped: EquippedCosmetics; claimedRewardIds: string[] };
import type { Alliance, Treaty, DiplomacyStats, DailyQuestMetric, RegionState, RivalIntent } from "@kingdoms/shared";

export type GameState = {
  kingdom: { id: string; name: string };
  season: SeasonState;
  players: Player[];
  cities: CityState[];
  caravans: CaravanState[];
  armies: Army[];
  commanders: Commander[];
  troopReserves: Record<string, TroopReserve>;
  formationPresets: FormationPreset[];
  trainingQueues: Record<string, TrainingQueue>;
  hospitalQueues: Record<string, HospitalQueue>;
  technologyProgress: Record<string, TechnologyProgress>;
  researchQueues: Record<string, ResearchQueue>;
  campaignProgress: Record<string, CampaignProgress>;
  activeOperations: Record<string, OperationRun>;
  heroes: Hero[];
  scores: Record<string, Scores>;
  seasonHistory: Array<{ seasonId: string; rankings: Array<{ playerId: string; rank: number; overall: number; scores: Scores }>; closedAt: string }>;
  legacyRecords: LegacyRecord[];
  battleReports: BattleReport[];
  /** Tiles that differ from the authored world in `@kingdoms/shared`, keyed `"x,y"` — not the
   *  world itself. Read it through `terrainOf()`, which falls through to `terrainAt()`. Only
   *  `map_tiles` rows put anything here, so today it is empty. */
  terrainMap: Record<string, TerrainType>;
  /** Permanent discovery for the active season, stored as compact bit masks per player. */
  explorationMasks: Record<string, Exploration>;
  alliances: Alliance[];
  allianceVotes: AllianceVote[];
  treaties: Treaty[];
  diplomacyThroughput: Record<string, DiplomacyStats>;
  militaryThroughput: Record<string, MilitaryStats>;
  /** Who holds each province, keyed by province code — recomputed every tick by
   *  `recalculateScores`, not accumulated. Cached here rather than derived in `getSnapshot`
   *  because that runs once per connected viewer: one pass over the armies per tick instead
   *  of one per spectator. Persisted with the rest of the state only incidentally; a load
   *  that predates the field starts empty and the next tick fills it in. */
  regionControl: Record<string, string>;
  regionStates: Record<string, RegionState>;
  rivalIntents: RivalIntent[];
  /** Monotonic identity for public territory transitions. It advances only when
   * the controller map changes, allowing A→B→A to remain two distinct facts. */
  regionControlRevision: number;
  spyMissions: SpyMission[];
  worldEvents: WorldEvent[];
  counterIntelActive: Record<string, string>;
  seasonMetrics: SeasonMetrics;
  raiderSpawnState: { sequence: number; nextRespawnAt?: string };
  // Evidence counters for server-verified onboarding steps, kept in the
  // canonical game_state JSON (no dedicated table needed).
  logisticsCounters: { exports: Record<string, { wood: number; stone: number; iron: number }>; harvests: Record<string, number> };
  cosmeticAccounts: Record<string, CosmeticAccount>;
  // Daily quests, baseline-diff style: only the day a player is on, the counter
  // baselines captured at that day's roll, and what they have claimed. Progress
  // itself is derived on read (`max(0, current − baseline)`) — see
  // `daily-quests.ts`. Lifetime activity counters that have no existing
  // monotonic source; `harvests` lives in `logisticsCounters` above.
  dailyQuests: Record<string, DailyQuestPlayerState>;
  activityCounters: { trainingBatches: Record<string, number>; caravansDelivered: Record<string, number>; campaignsCompleted: Record<string, number> };
};

export type DailyQuestPlayerState = {
  dayKey: string;
  baselines: Record<DailyQuestMetric, number>;
  claimedQuestIds: string[];
  claimedMilestones: number[];
};

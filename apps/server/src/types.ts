import type { Army, FactionId, Hero, Resources, Scores, BattleReport, TerrainType, SpyMission, WorldEvent, AllianceVote } from "@kingdoms/shared";

export type SeasonStatus = "SCHEDULED" | "ACTIVE" | "FINALIZING" | "CLOSED";
export type QueueType = "build" | "research";

export type Player = { id: string; displayName: string; factionId: FactionId; kingdomId: string; crossSeasonReputation: number; userId?: string; status?: "active" | "banned"; bannedAt?: string };
export type QueueItem = { id: string; type: QueueType; buildingId: string; targetLevel: number; startedAt: string; completesAt: string };
export type CityState = { id: string; playerId: string; name: string; x: number; y: number; resources: Resources; buildings: Record<string, number>; queues: QueueItem[]; starterGranted?: boolean; frozen?: boolean; frozenAt?: string };
export type CaravanState = { id: string; ownerPlayerId: string; sourceCityId: string; destinationCityId: string; progress: number; status: "moving" | "delivered" | "ambushed"; routeId?: string; cargo?: Resources; departureAt?: string; arrivesAt?: string; escortArmyId?: string; ambushSeed?: number; frozen?: boolean; frozenAt?: string };
export type SeasonState = { id: string; status: SeasonStatus; startsAt: string; endsAt: string };
export type LegacyRecord = { id: string; ownerId: string; seasonId: string; recordType: string; payload: unknown };
export type MilitaryStats = { victories: number; defeats: number; draws: number; strengthDestroyed: number; strengthLost: number; tilesControlled: number; successfulDefenses: number };
export type SeasonMetrics = { resourcesProduced: Record<string, { wood: number; stone: number; iron: number }> };
import type { Alliance, Treaty, DiplomacyStats } from "@kingdoms/shared";

export type GameState = {
  kingdom: { id: string; name: string };
  season: SeasonState;
  players: Player[];
  cities: CityState[];
  caravans: CaravanState[];
  armies: Army[];
  heroes: Hero[];
  scores: Record<string, Scores>;
  seasonHistory: Array<{ seasonId: string; rankings: Array<{ playerId: string; rank: number; overall: number; scores: Scores }>; closedAt: string }>;
  legacyRecords: LegacyRecord[];
  processedCommands: string[];
  battleReports: BattleReport[];
  terrainMap: Record<string, TerrainType>;
  alliances: Alliance[];
  allianceVotes: AllianceVote[];
  treaties: Treaty[];
  diplomacyThroughput: Record<string, DiplomacyStats>;
  militaryThroughput: Record<string, MilitaryStats>;
  spyMissions: SpyMission[];
  worldEvents: WorldEvent[];
  counterIntelActive: Record<string, string>;
  seasonMetrics: SeasonMetrics;
  raiderSpawnState: { sequence: number; nextRespawnAt?: string };
  // Evidence counters for server-verified onboarding steps, kept in the
  // canonical game_state JSON (no dedicated table needed).
  logisticsCounters: { exports: Record<string, { wood: number; stone: number; iron: number }>; harvests: Record<string, number> };
};


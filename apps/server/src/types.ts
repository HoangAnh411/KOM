import type { Army, FactionId, Hero, Resources, Scores } from "@kingdoms/shared";

export type SeasonStatus = "SCHEDULED" | "ACTIVE" | "FINALIZING" | "CLOSED";
export type QueueType = "build" | "research";

export type Player = { id: string; displayName: string; factionId: FactionId; kingdomId: string };
export type QueueItem = { id: string; type: QueueType; buildingId: string; targetLevel: number; startedAt: string; completesAt: string };
export type CityState = { id: string; playerId: string; name: string; x: number; y: number; resources: Resources; buildings: Record<string, number>; queues: QueueItem[] };
export type CaravanState = { id: string; ownerPlayerId: string; sourceCityId: string; destinationCityId: string; progress: number; status: "moving" | "delivered" | "ambushed" };
export type SeasonState = { id: string; status: SeasonStatus; startsAt: string; endsAt: string };
export type LegacyRecord = { id: string; ownerId: string; seasonId: string; recordType: string; payload: unknown };
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
};

import { randomUUID } from "node:crypto";
import type { Scores } from "@kingdoms/shared";
import type { GameState, LegacyRecord } from "./types.js";

export const seasonResetTemplate = "v1_hard_reset";
const zeroScores = (): Scores => ({ military: 0, economy: 0, diplomacy: 0, overall: 0 });

export function buildLegacyRecords(state: GameState, seasonId: string, rankings: Array<{ playerId: string; rank: number; overall: number; scores: Scores }>): LegacyRecord[] {
  return state.players.flatMap(player => {
    const city = state.cities.find(item => item.playerId === player.id);
    const stats = state.militaryThroughput[player.id]; const production = state.seasonMetrics.resourcesProduced[player.id] ?? { wood: 0, stone: 0, iron: 0 };
    const ranking = rankings.find(item => item.playerId === player.id)!;
    return [
      { id: randomUUID(), ownerId: player.id, seasonId, recordType: "peak_buildings", payload: { buildings: city?.buildings ?? {} } },
      { id: randomUUID(), ownerId: player.id, seasonId, recordType: "season_stats", payload: { resourcesProduced: production, battlesWon: stats?.victories ?? 0 } },
      { id: randomUUID(), ownerId: player.id, seasonId, recordType: "season_result", payload: ranking }
    ];
  });
}

export function hardReset(state: GameState, nextSeason: GameState["season"]): void {
  for (const player of state.players) player.crossSeasonReputation += Math.trunc((state.diplomacyThroughput[player.id]?.reputation ?? 0) * 0.5);
  for (const city of state.cities) { city.resources = { food: 0, wood: 500, stone: 500, iron: 500 }; city.buildings = { town_hall: 1 }; city.queues = []; city.starterGranted = true; }
  for (const alliance of state.alliances) for (const member of alliance.members) member.contribution = 0;
  state.season = nextSeason; state.armies = []; state.heroes = []; state.caravans = []; state.scores = Object.fromEntries(state.players.map(player => [player.id, zeroScores()]));
  state.battleReports = []; state.militaryThroughput = {}; state.treaties = []; state.diplomacyThroughput = {};
  // Armies were just cleared, so nobody holds anything; leaving the old map here would paint
  // last season's owners until the next tick recomputed it.
  state.regionControl = {};
  state.spyMissions = []; state.worldEvents = []; state.counterIntelActive = {}; state.allianceVotes = []; state.seasonMetrics = { resourcesProduced: {} };
}

export function reputationCosmetic(score: number): { title: string | null; badge: string | null; cityGlow: boolean } {
  if (score <= -200) return { title: "Kẻ phản bội", badge: "red_skull", cityGlow: false };
  if (score >= 500) return { title: "Đại sứ Meridian", badge: "gold", cityGlow: true };
  if (score >= 300) return { title: "Nhà ngoại giao kỳ cựu", badge: "silver", cityGlow: false };
  if (score >= 100) return { title: "Nhà ngoại giao", badge: "bronze", cityGlow: false };
  return { title: null, badge: null, cityGlow: false };
}

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
  // A season changes goals and scoreboards, not the player's town or army roster.
  // Orders, wounded troops, reserves and research therefore cross the boundary intact.
  for (const alliance of state.alliances) for (const member of alliance.members) member.contribution = 0;
  state.season = nextSeason;
  // Seasonal NPC encounters are regenerated; player armies and their orders remain.
  state.armies = state.armies.filter(army => army.ownerType === "player");
  state.scores = Object.fromEntries(state.players.map(player => [player.id, zeroScores()]));
  state.militaryThroughput = {};
  state.diplomacyThroughput = {};
  state.treaties = [];
  state.allianceVotes = [];
  state.spyMissions = [];
  // Daily-quest baselines reference per-season counters (`militaryThroughput`
  // victories, `spyMissions`) that the lines above just zeroed — a kept
  // baseline would read as negative progress and be clamped away, quietly
  // bricking the battles/spy quests for the rest of the boundary day. Clear
  // the records instead; the next tick re-baselines everyone. The cost is at
  // most one in-progress day lost at a season boundary, which is the same
  // forfeit a midnight roll already implies.
  state.dailyQuests = {};
  state.worldEvents = [];
  state.counterIntelActive = {};
  state.seasonMetrics = { resourcesProduced: {} };
  // Territory is recalculated on the next tick from the preserved army positions.
  state.regionControl = {};
  state.regionControlRevision = (state.regionControlRevision ?? 0) + 1;
}

export function reputationCosmetic(score: number): { title: string | null; badge: string | null; cityGlow: boolean } {
  if (score <= -200) return { title: "Kẻ phản bội", badge: "red_skull", cityGlow: false };
  if (score >= 500) return { title: "Đại sứ Meridian", badge: "gold", cityGlow: true };
  if (score >= 300) return { title: "Nhà ngoại giao kỳ cựu", badge: "silver", cityGlow: false };
  if (score >= 100) return { title: "Nhà ngoại giao", badge: "bronze", cityGlow: false };
  return { title: null, badge: null, cityGlow: false };
}

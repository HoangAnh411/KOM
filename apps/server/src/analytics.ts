import { randomUUID } from "node:crypto";
import type { FactionId, Scores } from "@kingdoms/shared";
import type { GameState } from "./types.js";

export type AnalyticsEvent = { id: string; seasonId: string; playerId?: string; eventType: string; payload: unknown };
export function buildSeasonAnalytics(state: GameState, seasonId: string, rankings: Array<{ playerId: string; rank: number; scores: Scores }>): AnalyticsEvent[] {
  const factionStanding = new Map<FactionId, { total: number; players: number; wins: number }>();
  for (const ranking of rankings) { const faction = state.players.find(player => player.id === ranking.playerId)!.factionId; const row = factionStanding.get(faction) ?? { total: 0, players: 0, wins: 0 }; row.total += ranking.scores.overall; row.players++; if (ranking.rank === 1) row.wins++; factionStanding.set(faction, row); }
  const events: AnalyticsEvent[] = [{ id: randomUUID(), seasonId, eventType: "season_analytics", payload: { factions: Object.fromEntries(factionStanding) } }];
  const factionSpy = new Map<FactionId, { successes: number; total: number }>();
  for (const player of state.players) {
    const missions = state.spyMissions.filter(mission => mission.actorPlayerId === player.id && mission.status !== "in_progress");
    const successes = missions.filter(mission => mission.status === "success").length;
    const spy = factionSpy.get(player.factionId) ?? { successes: 0, total: 0 }; spy.successes += successes; spy.total += missions.length; factionSpy.set(player.factionId, spy);
    const military = state.militaryThroughput[player.id]; const diplomacy = state.diplomacyThroughput[player.id];
    events.push({ id: randomUUID(), seasonId, playerId: player.id, eventType: "player_engagement", payload: { factionId: player.factionId, spySuccessRate: missions.length ? successes / missions.length : null, combatIgnored: !military || military.victories + military.defeats + military.draws === 0, diplomacyIgnored: !diplomacy || diplomacy.activeTreaties + diplomacy.treatiesHonored + diplomacy.treatiesViolated + diplomacy.allianceContribution === 0 } });
  }
  events.push({ id: randomUUID(), seasonId, eventType: "faction_spy_analytics", payload: { factions: Object.fromEntries([...factionSpy].map(([faction, value]) => [faction, { ...value, successRate: value.total ? value.successes / value.total : null }])) } });
  return events;
}

import { dailyQuestMilestones, dailyQuestDayKey, dailyQuestRefreshesAt, dailyQuests, selectDailyQuestIds } from "@kingdoms/shared";
import type { DailyQuestMetric, DailyQuestSnapshot } from "@kingdoms/shared";
import type { GameState } from "./types.js";
import { CommandRegistry } from "./command-registry.js";

/** The seven daily-quest metrics read from their monotonic sources. Two are
 *  per-season (`battles_won`, `spy_successes` reset at `hardReset`), the rest
 *  are lifetime — the baseline-diff makes either work, but the season reset
 *  clears `dailyQuests` so no baseline outlives the counters it references. */
export function currentDailyMetrics(state: GameState, playerId: string): Record<DailyQuestMetric, number> {
  return {
    harvests: state.logisticsCounters.harvests[playerId] ?? 0,
    builds_completed: state.cities.filter(city => city.playerId === playerId).reduce((sum, city) => sum + Object.values(city.buildings).reduce((levels, level) => levels + level, 0), 0),
    training_batches: state.activityCounters.trainingBatches[playerId] ?? 0,
    caravans_delivered: state.activityCounters.caravansDelivered[playerId] ?? 0,
    battles_won: state.militaryThroughput[playerId]?.victories ?? 0,
    campaigns_completed: state.activityCounters.campaignsCompleted[playerId] ?? 0,
    spy_successes: state.spyMissions.filter(mission => mission.actorPlayerId === playerId && mission.status === "success").length,
  };
}

// Daily quests, baseline-diff style. Nothing on the progress path writes: a
// quest's progress is `max(0, current − baseline)` derived on read from
// monotonic counters, against per-player baselines captured when their day
// rolled. Stored per player: the UTC day they are on, those baselines, and
// what they have claimed. The day roll is pulled by `verify` inside every
// tick (so a player offline across midnight still gets a correct baseline)
// and pushed lazily by `ensureToday` from `getSnapshot`/`claim` for the
// window before the next tick sees them.
export class DailyQuestRepository {
  constructor(private readonly commands: CommandRegistry = new CommandRegistry()) {}

  /** Rolls every player whose record is missing or on an older day. Returns
   *  true when anything changed, so `store.tick` can save. */
  verify(state: GameState, now = Date.now()): boolean {
    let changed = false;
    for (const player of state.players) {
      const record = state.dailyQuests[player.id];
      if (!record || record.dayKey !== dailyQuestDayKey(now)) {
        state.dailyQuests[player.id] = this.roll(state, player.id, now);
        changed = true;
      }
    }
    return changed;
  }

  /** Lazy single-player roll — the `onboarding.verify` pattern for the window
   *  between a day flip and the next tick. */
  private ensureToday(state: GameState, playerId: string, now: number): void {
    const record = state.dailyQuests[playerId];
    if (!record || record.dayKey !== dailyQuestDayKey(now)) state.dailyQuests[playerId] = this.roll(state, playerId, now);
  }

  private roll(state: GameState, playerId: string, now: number) {
    return { dayKey: dailyQuestDayKey(now), baselines: currentDailyMetrics(state, playerId), claimedQuestIds: [], claimedMilestones: [] };
  }

  /** Viewer-scoped progress for the snapshot. Claims the resource rewards for
   *  nothing — it only reports; points come from completion, not claiming. */
  snapshotFor(state: GameState, playerId: string, now = Date.now()): DailyQuestSnapshot {
    this.ensureToday(state, playerId, now);
    const record = state.dailyQuests[playerId]!;
    const current = currentDailyMetrics(state, playerId);
    const quests = selectDailyQuestIds(record.dayKey).map(questId => {
      const definition = dailyQuests.find(quest => quest.id === questId)!;
      return { questId, progress: Math.max(0, current[definition.metric] - record.baselines[definition.metric]), claimed: record.claimedQuestIds.includes(questId) };
    });
    return { dayKey: record.dayKey, refreshesAt: dailyQuestRefreshesAt(now), points: this.pointsFor(quests), quests, claimedMilestones: [...record.claimedMilestones] };
  }

  private pointsFor(quests: Array<{ questId: string; progress: number }>): number {
    return quests.reduce((sum, quest) => {
      const definition = dailyQuests.find(item => item.id === quest.questId)!;
      return sum + (quest.progress >= definition.target ? definition.points : 0);
    }, 0);
  }

  /** `POST /api/commands/daily-quest/claim` — one endpoint, two targets. A
   *  quest pays its catalog reward; a milestone pays its table reward. Both
   *  land in the player's first city, the same branch campaign rewards use.
   *  Unclaimed rewards are forfeit at the day roll — there is no catch-up. */
  claim(commandId: string, playerId: string, target: { questId?: string; milestone?: 5 | 10 }, state: GameState, now = Date.now()): string {
    this.ensureToday(state, playerId, now);
    const record = state.dailyQuests[playerId]!;
    if (target.questId !== undefined) return this.claimQuest(commandId, playerId, target.questId, record, state);
    return this.claimMilestone(commandId, playerId, target.milestone!, record, state);
  }

  private claimQuest(commandId: string, playerId: string, questId: string, record: NonNullable<GameState["dailyQuests"][string]>, state: GameState): string {
    // Command dedupe comes before every state guard, the `breakTreaty`
    // ordering: a replay of an accepted claim must answer `already_processed`,
    // not run into DAILY_QUEST_ALREADY_CLAIMED below. A throw after this line
    // rolls the journal back inside `executeCommand`, so the id stays retryable.
    if (!this.commands.claim(commandId)) return "already_processed";
    const today = selectDailyQuestIds(record.dayKey);
    // A quest id outside today's selection is yesterday's quest (or noise) —
    // claiming across the midnight boundary is exactly what the reset forbids.
    if (!today.includes(questId)) throw new Error("DAILY_QUEST_STALE_DAY");
    if (record.claimedQuestIds.includes(questId)) throw new Error("DAILY_QUEST_ALREADY_CLAIMED");
    const definition = dailyQuests.find(quest => quest.id === questId)!;
    const progress = Math.max(0, currentDailyMetrics(state, playerId)[definition.metric] - record.baselines[definition.metric]);
    if (progress < definition.target) throw new Error("DAILY_QUEST_NOT_COMPLETED");
    record.claimedQuestIds.push(questId);
    this.grant(definition.reward, state, playerId);
    return "accepted";
  }

  private claimMilestone(commandId: string, playerId: string, milestone: 5 | 10, record: NonNullable<GameState["dailyQuests"][string]>, state: GameState): string {
    if (!this.commands.claim(commandId)) return "already_processed";
    const definition = dailyQuestMilestones.find(item => item.points === milestone);
    if (!definition) throw new Error("MILESTONE_NOT_FOUND");
    if (record.claimedMilestones.includes(milestone)) throw new Error("MILESTONE_ALREADY_CLAIMED");
    const current = currentDailyMetrics(state, playerId);
    const quests = selectDailyQuestIds(record.dayKey).map(questId => {
      const quest = dailyQuests.find(item => item.id === questId)!;
      return { questId, progress: Math.max(0, current[quest.metric] - record.baselines[quest.metric]) };
    });
    if (this.pointsFor(quests) < milestone) throw new Error("MILESTONE_NOT_REACHED");
    record.claimedMilestones.push(milestone);
    this.grant(definition.reward, state, playerId);
    return "accepted";
  }

  private grant(reward: { wood: number; stone: number; iron: number }, state: GameState, playerId: string): void {
    const city = state.cities.find(item => item.playerId === playerId);
    if (!city) return;
    city.resources.wood += reward.wood;
    city.resources.stone += reward.stone;
    city.resources.iron += reward.iron;
  }
}

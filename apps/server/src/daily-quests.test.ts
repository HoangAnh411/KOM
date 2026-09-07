import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";
import { dailyQuestDayKey, dailyQuests, selectDailyQuestIds, type DailyQuestMetric } from "@kingdoms/shared";
import type { GameState } from "./types.js";

// A fixed "now" keeps the day selection deterministic: the suite knows exactly
// which three easy quests `selectDailyQuestIds` drew for 2026-09-08.
const NOW = Date.parse("2026-09-08T10:00:00.000Z");

/** Nudge a metric the way the game would — each branch is the same monotonic
 *  source `currentDailyMetrics` reads, bumped directly so no battle, caravan
 *  or training run has to happen inside these tests. */
function bump(state: GameState, playerId: string, metric: DailyQuestMetric, by = 1): void {
  switch (metric) {
    case "harvests": state.logisticsCounters.harvests[playerId] = (state.logisticsCounters.harvests[playerId] ?? 0) + by; break;
    case "builds_completed": {
      const city = state.cities.find(item => item.playerId === playerId)!;
      city.buildings.warehouse = (city.buildings.warehouse ?? 0) + by; break;
    }
    case "training_batches": state.activityCounters.trainingBatches[playerId] = (state.activityCounters.trainingBatches[playerId] ?? 0) + by; break;
    case "caravans_delivered": state.activityCounters.caravansDelivered[playerId] = (state.activityCounters.caravansDelivered[playerId] ?? 0) + by; break;
    case "battles_won": (state.militaryThroughput[playerId] ??= { victories: 0, defeats: 0, draws: 0, strengthDestroyed: 0, strengthLost: 0, tilesControlled: 0, successfulDefenses: 0 }).victories += by; break;
    case "campaigns_completed": state.activityCounters.campaignsCompleted[playerId] = (state.activityCounters.campaignsCompleted[playerId] ?? 0) + by; break;
    case "spy_successes":
      for (let index = 0; index < by; index++) state.spyMissions.push({ id: `spy-${playerId}-${state.spyMissions.length}`, kingdomId: state.kingdom.id, actorPlayerId: playerId, targetPlayerId: "someone", missionType: "scout", status: "success", accuracy: 1, cost: { wood: 0, stone: 0, iron: 50 }, startedAt: new Date(0).toISOString(), completesAt: new Date(0).toISOString() });
      break;
  }
}

/** Complete every quest in `questIds` (optionally filtered), returning the
 *  points the board should read afterwards. */
function completeAll(state: GameState, playerId: string, questIds: string[], only?: (questId: string) => boolean): number {
  let points = 0;
  for (const questId of questIds) {
    const definition = dailyQuests.find(quest => quest.id === questId)!;
    if (only && !only(questId)) continue;
    bump(state, playerId, definition.metric, definition.target);
    points += definition.points;
  }
  return points;
}

test("the tick-pulled day roll re-baselines and clears claims, swallowing pre-roll bumps", () => {
  const store = new GameStore();
  const state = store.snapshot;
  const player = state.players[0]!;
  // Yesterday's record, with a claimed quest and milestone that must not leak.
  state.dailyQuests[player.id] = { dayKey: "2000-01-01", baselines: { harvests: 0, builds_completed: 0, training_batches: 0, caravans_delivered: 0, battles_won: 0, campaigns_completed: 0, spy_successes: 0 }, claimedQuestIds: ["daily_harvest"], claimedMilestones: [5] };
  // Activity before the roll belongs to the old day — it lands in the baseline.
  bump(state, player.id, "harvests", 5);
  assert.equal(store.dailyQuests.verify(state, NOW), true);
  const record = state.dailyQuests[player.id]!;
  assert.equal(record.dayKey, dailyQuestDayKey(NOW));
  assert.deepEqual(record.claimedQuestIds, []);
  assert.deepEqual(record.claimedMilestones, []);
  assert.equal(record.baselines.harvests, 5, "the pre-roll activity was absorbed, not credited");
  // A second verify on the same day is a no-op.
  assert.equal(store.dailyQuests.verify(state, NOW), false);
});

test("progress derives per metric, and points count only completed quests", () => {
  const store = new GameStore();
  const state = store.snapshot;
  const player = state.players[0]!;
  store.dailyQuests.verify(state, NOW);
  const questIds = selectDailyQuestIds(dailyQuestDayKey(NOW));
  // Half of the board done: each selected easy quest at exactly target.
  const easyIds = questIds.filter(questId => dailyQuests.find(quest => quest.id === questId)!.difficulty === "easy");
  const expected = completeAll(state, player.id, easyIds);
  const snapshot = store.dailyQuests.snapshotFor(state, player.id, NOW);
  assert.equal(snapshot.quests.length, 6);
  assert.equal(snapshot.points, expected);
  for (const quest of snapshot.quests) {
    const definition = dailyQuests.find(item => item.id === quest.questId)!;
    if (easyIds.includes(quest.questId)) assert.equal(quest.progress, definition.target);
    else assert.equal(quest.progress, 0, `${quest.questId} was not touched`);
  }
  // Over-achievement keeps counting — a completed quest's raw progress does not clamp.
  const firstEasy = dailyQuests.find(quest => quest.id === easyIds[0])!;
  bump(state, player.id, firstEasy.metric, 100);
  const after = store.dailyQuests.snapshotFor(state, player.id, NOW);
  assert.ok(after.quests.find(quest => quest.questId === firstEasy.id)!.progress > firstEasy.target);
});

test("claiming a quest pays its reward once, then refuses both ids and repeats", async () => {
  const store = new GameStore();
  const state = store.snapshot;
  const player = state.players[0]!;
  store.dailyQuests.verify(state, NOW);
  const city = state.cities.find(item => item.playerId === player.id)!;
  const questId = selectDailyQuestIds(dailyQuestDayKey(NOW)).find(id => id === "daily_battle")!;
  const definition = dailyQuests.find(quest => quest.id === questId)!;
  // Not finished yet — a different id from the eventual claim, the way a real
  // client sends a fresh commandId per attempt (a failed direct call does not
  // roll the command journal back the way `executeCommand` would).
  assert.throws(() => store.dailyQuests.claim("claim-battle-0", player.id, { questId }, state, NOW), /DAILY_QUEST_NOT_COMPLETED/);
  bump(state, player.id, definition.metric, definition.target);
  const woodBefore = city.resources.wood;
  assert.equal(store.dailyQuests.claim("claim-battle-1", player.id, { questId }, state, NOW), "accepted");
  assert.equal(city.resources.wood, woodBefore + definition.reward.wood);
  assert.ok(state.dailyQuests[player.id]!.claimedQuestIds.includes(questId));
  // The same command id replays as already_processed; a new id hits the claim guard.
  assert.equal(store.dailyQuests.claim("claim-battle-1", player.id, { questId }, state, NOW), "already_processed");
  assert.throws(() => store.dailyQuests.claim("claim-battle-2", player.id, { questId }, state, NOW), /DAILY_QUEST_ALREADY_CLAIMED/);
  // The reward landed once, not twice.
  assert.equal(city.resources.wood, woodBefore + definition.reward.wood);
});

test("milestones pay at 5 and 10 points and survive re-claims the same way", async () => {
  const store = new GameStore();
  const state = store.snapshot;
  const player = state.players[0]!;
  store.dailyQuests.verify(state, NOW);
  const questIds = selectDailyQuestIds(dailyQuestDayKey(NOW));
  const city = state.cities.find(item => item.playerId === player.id)!;
  // Everything but the spy quest: 3×1 + 2×2 = 7 points — past the first
  // milestone, short of the second.
  const points = completeAll(state, player.id, questIds, questId => questId !== "daily_spy");
  assert.equal(points, 7);
  assert.equal(store.dailyQuests.snapshotFor(state, player.id, NOW).points, 7);
  const woodBefore = city.resources.wood;
  assert.equal(store.dailyQuests.claim("claim-ms-1", player.id, { milestone: 5 }, state, NOW), "accepted");
  assert.equal(city.resources.wood, woodBefore + 150);
  // Points do not drop when a milestone is claimed, and the milestone cannot repeat.
  assert.equal(store.dailyQuests.snapshotFor(state, player.id, NOW).points, 7);
  assert.throws(() => store.dailyQuests.claim("claim-ms-2", player.id, { milestone: 5 }, state, NOW), /MILESTONE_ALREADY_CLAIMED/);
  assert.throws(() => store.dailyQuests.claim("claim-ms-3", player.id, { milestone: 10 }, state, NOW), /MILESTONE_NOT_REACHED/);
  // The spy quest closes the board: 10 points, second milestone.
  bump(state, player.id, "spy_successes", 1);
  assert.equal(store.dailyQuests.claim("claim-ms-4", player.id, { milestone: 10 }, state, NOW), "accepted");
  assert.equal(city.resources.wood, woodBefore + 150 + 400);
});

test("a quest id from another day is stale, not claimable", () => {
  const store = new GameStore();
  const state = store.snapshot;
  const player = state.players[0]!;
  store.dailyQuests.verify(state, NOW);
  const selected = selectDailyQuestIds(dailyQuestDayKey(NOW));
  // The easy pool holds four and the day draws three — the one left out stands
  // in for anything not in today's selection.
  const leftOut = dailyQuests.find(quest => quest.difficulty === "easy" && !selected.includes(quest.id))!;
  bump(state, player.id, leftOut.metric, leftOut.target);
  assert.throws(() => store.dailyQuests.claim("claim-stale-1", player.id, { questId: leftOut.id }, state, NOW), /DAILY_QUEST_STALE_DAY/);
});

test("season close mid-day clears the records, and post-reset wins read as progress, never negative", async () => {
  const store = new GameStore();
  const state = store.snapshot;
  const player = state.players[0]!;
  store.dailyQuests.verify(state, NOW);
  bump(state, player.id, "battles_won", 1);
  state.season.endsAt = new Date(0).toISOString();
  await store.finalizeIfDue();
  assert.deepEqual(state.dailyQuests, {}, "hard reset must clear daily quest records");
  // The military throughput the baselines referenced was reset with the season.
  assert.equal(state.militaryThroughput[player.id], undefined);
  // The next tick re-baselines; a win after the close is fresh progress — the
  // bump must come after the roll or it lands in the new baseline.
  store.dailyQuests.verify(state, Date.now());
  bump(state, player.id, "battles_won", 1);
  const snapshot = store.dailyQuests.snapshotFor(state, player.id, Date.now());
  const battleQuest = snapshot.quests.find(quest => quest.questId === "daily_battle")!;
  assert.equal(battleQuest.progress, 1);
  assert.equal(snapshot.points, 2);
});

test("a missing record is rolled lazily by the first read", () => {
  const store = new GameStore();
  const state = store.snapshot;
  const player = state.players[0]!;
  delete state.dailyQuests[player.id];
  bump(state, player.id, "harvests", 2);
  const snapshot = store.dailyQuests.snapshotFor(state, player.id, NOW);
  assert.equal(snapshot.dayKey, dailyQuestDayKey(NOW));
  // The lazy roll absorbed the two harvests into the baseline — they predate
  // the record, so they belong to no day.
  const harvestQuest = snapshot.quests.find(quest => quest.questId === "daily_harvest")!;
  assert.equal(harvestQuest.progress, 0);
  assert.ok(Date.parse(snapshot.refreshesAt) > NOW);
});

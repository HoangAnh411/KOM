import test from "node:test";
import assert from "node:assert/strict";
import { campaignMissions, onboardingSteps, type Alliance, type AllianceVote, type Army, type City, type Treaty, type WorldSnapshot } from "@kingdoms/shared";
import type { PendingCommand } from "./commands.js";
import { onboardingChapters, selectNextBestAction } from "./next-action.js";

const ME = "player-me";
const FOE = "player-foe";
const AT = "2026-09-03T00:00:00.000Z";
const city = (over: Partial<City> = {}): City => ({
  id: "city-me", playerId: ME, playerName: "Ember", name: "Hoa Lư", x: 5, y: 5,
  resources: { food: 200, wood: 200, stone: 200, iron: 200 }, buildings: { town_hall: 1 },
  cityLayoutVersion: 2, cityLayoutRevision: 0, buildingPlots: [{ buildingId: "town_hall", x: 2, y: 2, rotation: 0 }], queues: [], ...over,
});
const army = (over: Partial<Army> = {}): Army => ({
  id: "army-me", ownerType: "player", ownerPlayerId: ME, x: 6, y: 7, unitType: "infantry", strength: 120, morale: 80, formation: "line", supply: 100, ...over,
});
const world = (over: Partial<WorldSnapshot> = {}): WorldSnapshot => ({
  protocolVersion: 1, kingdom: { id: "kingdom-1", name: "Meridian" }, season: { id: "season-1", status: "ACTIVE", endsAt: AT },
  world: { id: "meridian-256-v2", extent: 256, chunkSize: 16, digest: "test", assetManifestUrl: "/manifest.json" },
  exploration: { resolution: 64, revision: 0, encodedMask: "" }, cities: [city()], caravans: [], armies: [], heroes: [], scores: {}, factionCatalog: {},
  logistics: { resourceNodes: [], depots: [], tradeRoutes: [], marketHubs: [], throughput: {} },
  onboarding: { variant: "web_alpha_v1", completedSteps: [...onboardingSteps] }, ...over,
});
const pending = (over: Partial<PendingCommand> = {}): PendingCommand => ({ commandId: "command-1", kind: "build", label: "Xây kho", path: "/api/commands/build", body: {}, status: "uncertain", startedAt: 1, ...over });

const completeOnboarding = { variant: "web_alpha_v1", completedSteps: [...onboardingSteps] };

test("three presentation chapters preserve every onboarding id exactly once", () => {
  const shown = onboardingChapters.flatMap(chapter => chapter.steps);
  assert.deepEqual([...shown].sort(), [...onboardingSteps].sort());
  assert.equal(new Set(shown).size, onboardingSteps.length);
});

test("uncertain command wins over supply danger and keeps its command id", () => {
  const action = selectNextBestAction(world({ armies: [army({ supply: 1 })] }), [pending()], ME)!;
  assert.equal(action.id, "retry:command-1");
  assert.deepEqual(action.intent, { kind: "retry", commandId: "command-1" });
});

test("supply danger wins over an operation decision and selects that army", () => {
  const treaty: Treaty = { id: "t1", kingdomId: "k", proposerPlayerId: FOE, targetPlayerId: ME, treatyType: "trade_pact", status: "proposed", durationSeconds: 60, proposedAt: AT };
  const action = selectNextBestAction(world({ armies: [army({ supply: 24 })], treaties: [treaty] }), [], ME)!;
  assert.equal(action.category, "urgent");
  assert.deepEqual(action.intent, { kind: "select", selection: { kind: "army", id: "army-me" }, anchor: "army" });
});

test("incoming treaty and uncast alliance vote are operation decisions", () => {
  const treaty: Treaty = { id: "t1", kingdomId: "k", proposerPlayerId: FOE, targetPlayerId: ME, treatyType: "trade_pact", status: "proposed", durationSeconds: 60, proposedAt: AT };
  const treatyAction = selectNextBestAction(world({ treaties: [treaty] }), [], ME)!;
  assert.equal(treatyAction.id, "treaty:t1");
  assert.deepEqual(treatyAction.intent, { kind: "panel", anchor: "diplomacy" });
  const alliance: Alliance = { id: "a1", kingdomId: "k", name: "Đông Đô", tag: "DD", leaderPlayerId: FOE, members: [{ playerId: ME, role: "member", contribution: 0, joinedAt: AT }], createdAt: AT };
  const vote: AllianceVote = { id: "v1", allianceId: "a1", candidatePlayerId: FOE, openedByPlayerId: FOE, votes: [], status: "open", openedAt: AT, expiresAt: AT };
  const voteAction = selectNextBestAction(world({ alliances: [alliance], allianceVotes: [vote] }), [], ME)!;
  assert.equal(voteAction.id, "vote:v1");
  assert.deepEqual(voteAction.intent, { kind: "panel", anchor: "alliance" });
});

test("essential onboarding uses behavior intents before preparation", () => {
  const first = selectNextBestAction(world({ onboarding: { variant: "web_alpha_v1", completedSteps: [] } }), [], ME)!;
  assert.equal(first.id, "onboarding:city_inspected");
  assert.deepEqual(first.intent, { kind: "enter-city", cityId: "city-me" });
  const score = selectNextBestAction(world({ onboarding: { variant: "web_alpha_v1", completedSteps: onboardingSteps.filter(step => step !== "score_viewed") } }), [], ME)!;
  assert.equal(score.id, "onboarding:score_viewed");
  assert.deepEqual(score.intent, { kind: "profile" });
});

test("training or army creation comes before campaign", () => {
  const action = selectNextBestAction(world({ onboarding: completeOnboarding, cities: [city({ buildings: { town_hall: 1, barracks: 1 } })] }), [], ME)!;
  assert.equal(action.id, "preparation:train");
  assert.deepEqual(action.intent, { kind: "panel", anchor: "army" });
});

test("campaign selects the next unlocked mission target", () => {
  const mission = campaignMissions[0]!;
  const action = selectNextBestAction(world({ onboarding: completeOnboarding, armies: [army({ composition: { frontline: { id: "s", troopType: "spearmen", position: "frontline", count: 10 }, backline: null, flank: null } })] }), [], ME)!;
  assert.equal(action.id, `campaign:${mission.id}`);
  assert.deepEqual(action.intent, { kind: "select", selection: { kind: "tile", x: mission.target.x, y: mission.target.y }, anchor: "progression" });
});

test("research then building are the final growth fallbacks", () => {
  const allDone = campaignMissions.map(mission => mission.id);
  const campaignProgress = { [ME]: { playerId: ME, completedMissionIds: allDone, claimedFirstClearIds: allDone, unlockedChapter: 3 } };
  const research = selectNextBestAction(world({ onboarding: completeOnboarding, cities: [city({ buildings: { town_hall: 1, academy: 1 } })], armies: [army()], campaignProgress }), [], ME)!;
  assert.equal(research.id, "growth:research");
  const build = selectNextBestAction(world({ onboarding: completeOnboarding, armies: [army()], campaignProgress }), [], ME)!;
  assert.equal(build.id, "growth:build");
});

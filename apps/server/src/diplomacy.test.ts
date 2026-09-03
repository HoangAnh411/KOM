import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";
import { randomUUID } from "node:crypto";
import { diplomacyScore } from "@kingdoms/shared";

test("create and join alliance", () => {
  const store = new GameStore();
  const player1 = store.snapshot.players[0];
  const player2 = store.snapshot.players[1];

  store.diplomacy.createAlliance("cmd-1", "Knights", "KNT", player1.id, store.snapshot);
  const alliance = store.snapshot.alliances[0];
  assert.equal(alliance.name, "Knights");
  assert.equal(alliance.tag, "KNT");
  assert.equal(alliance.leaderPlayerId, player1.id);
  assert.equal(alliance.members.length, 1);

  store.diplomacy.joinAlliance("cmd-2", alliance.id, player2.id, store.snapshot);
  assert.equal(alliance.members.length, 2);
  assert.equal(alliance.members.find(m => m.playerId === player2.id)!.role, "member");
});

test("contribute to alliance with diminishing returns", () => {
  const store = new GameStore();
  const player1 = store.snapshot.players[0];
  const city = store.snapshot.cities.find(c => c.playerId === player1.id)!;
  city.resources = { food: 0, wood: 1000, stone: 1000, iron: 1000 };

  store.diplomacy.createAlliance("cmd-1", "Builders", "BLD", player1.id, store.snapshot);
  
  // 300 total given
  store.diplomacy.contributeAlliance("cmd-2", city.id, { wood: 100, stone: 100, iron: 100 }, player1.id, store.snapshot);
  
  const stats = store.diplomacy.getStats(player1.id, store.snapshot);
  // Expected formula: 100 * ln(1 + 300 / 100) = 100 * ln(4) = 100 * 1.386 = 138
  assert.equal(stats.allianceContribution, 138);
  assert.equal(stats.reputation, 10);
  assert.equal(city.resources.wood, 900);
});

test("propose and accept treaty", () => {
  const store = new GameStore();
  const player1 = store.snapshot.players[0];
  const player2 = store.snapshot.players[1];

  store.diplomacy.proposeTreaty("cmd-1", player2.id, "non_aggression", 86400, player1.id, store.snapshot);
  const treaty = store.snapshot.treaties[0];
  assert.equal(treaty.status, "proposed");
  assert.equal(treaty.treatyType, "non_aggression");

  store.diplomacy.respondTreaty("cmd-2", treaty.id, true, player2.id, store.snapshot);
  assert.equal(treaty.status, "active");

  const stats1 = store.diplomacy.getStats(player1.id, store.snapshot);
  const stats2 = store.diplomacy.getStats(player2.id, store.snapshot);
  assert.equal(stats1.activeTreaties, 1);
  assert.equal(stats2.activeTreaties, 1);
});

test("break treaty penalizes reputation", () => {
  const store = new GameStore();
  const player1 = store.snapshot.players[0];
  const player2 = store.snapshot.players[1];

  store.diplomacy.proposeTreaty("cmd-1", player2.id, "non_aggression", 86400, player1.id, store.snapshot);
  const treaty = store.snapshot.treaties[0];
  store.diplomacy.respondTreaty("cmd-2", treaty.id, true, player2.id, store.snapshot);

  store.diplomacy.breakTreaty("cmd-3", treaty.id, player1.id, store.snapshot);
  assert.equal(treaty.status, "violated");

  const stats1 = store.diplomacy.getStats(player1.id, store.snapshot);
  const stats2 = store.diplomacy.getStats(player2.id, store.snapshot);
  assert.equal(stats1.reputation, -150);
  assert.equal(stats1.treatiesViolated, 1);
  assert.equal(stats1.activeTreaties, 0);
  assert.equal(stats2.activeTreaties, 0); // Target's active count goes down
});

// P0.3b moved diplomacy dedupe out of `state.processedCommands` and into the shared registry, and
// with it from "push on success" to "claim at the check". A retried break must still be a no-op:
// the second call cannot cost another 150 reputation, and `TREATY_NOT_ACTIVE` backs it up.
test("a retried break treaty is idempotent, not a second penalty", () => {
  const store = new GameStore();
  const [player1, player2] = store.snapshot.players;

  store.diplomacy.proposeTreaty("retry-1", player2.id, "non_aggression", 86400, player1.id, store.snapshot);
  const treaty = store.snapshot.treaties[0];
  store.diplomacy.respondTreaty("retry-2", treaty.id, true, player2.id, store.snapshot);

  assert.equal(store.diplomacy.breakTreaty("retry-3", treaty.id, player1.id, store.snapshot), "accepted");
  assert.equal(store.diplomacy.breakTreaty("retry-3", treaty.id, player1.id, store.snapshot), "already_processed");

  const stats = store.diplomacy.getStats(player1.id, store.snapshot);
  assert.equal(stats.reputation, -150, "the penalty is charged once, not twice");
  assert.equal(stats.treatiesViolated, 1);
  // Even a *different* command id cannot double-charge: the treaty is no longer active.
  assert.throws(() => store.diplomacy.breakTreaty("retry-4", treaty.id, player1.id, store.snapshot), /TREATY_NOT_ACTIVE/);
});

test("diplomacy score calculation", () => {
  const score = diplomacyScore({
    reputation: 150,
    treatiesHonored: 5,
    treatiesViolated: 0,
    activeTreaties: 2,
    allianceContribution: 250
  });
  // Reputation (min 0, max 400) = 150
  // Treaty (min 0, max 300): 5 * 30 = 150
  // Cooperation (min 0, max 300): 2 * 50 + floor(100 * ln(1 + 2.5)) = 100 + floor(125.27) = 225
  // Total = 150 + 150 + 225 = 525
  assert.equal(score, 525);
});

test("only leader can manage members while officers can set notice and open vote", () => { const store = new GameStore(); const [leader, member] = store.snapshot.players; store.diplomacy.createAlliance("gov-create", "Council", "CNL", leader.id, store.snapshot); store.diplomacy.joinAlliance("gov-join", store.snapshot.alliances[0].id, member.id, store.snapshot); assert.throws(() => store.diplomacy.setNotice("gov-notice-denied", "x", member.id, store.snapshot), /OFFICER_REQUIRED/); store.diplomacy.manageMember("gov-promote", member.id, "promote", leader.id, store.snapshot); store.diplomacy.setNotice("gov-notice", "Ready", member.id, store.snapshot); assert.equal(store.snapshot.alliances[0].notice, "Ready"); });

test("leader vote passes only above half of total membership", () => { const store = new GameStore(); const [leader, candidate] = store.snapshot.players; const third = store.addDevPlayer("Third", "veiled"); store.diplomacy.createAlliance("vote-create", "Council", "VOT", leader.id, store.snapshot); const alliance = store.snapshot.alliances[0]; store.diplomacy.joinAlliance("vote-join-1", alliance.id, candidate.id, store.snapshot); store.diplomacy.joinAlliance("vote-join-2", alliance.id, third.id, store.snapshot); const vote = store.diplomacy.openVote("vote-open", candidate.id, leader.id, store.snapshot); store.diplomacy.castVote("vote-cast-1", vote.id, true, leader.id, store.snapshot); assert.equal(vote.status, "open"); store.diplomacy.castVote("vote-cast-2", vote.id, true, candidate.id, store.snapshot); assert.equal(vote.status, "passed"); assert.equal(alliance.leaderPlayerId, candidate.id); });

test("tie fails when all alliance members voted", () => { const store = new GameStore(); const [leader, candidate] = store.snapshot.players; store.diplomacy.createAlliance("tie-create", "Tie", "TIE", leader.id, store.snapshot); const alliance = store.snapshot.alliances[0]; store.diplomacy.joinAlliance("tie-join", alliance.id, candidate.id, store.snapshot); const vote = store.diplomacy.openVote("tie-open", candidate.id, leader.id, store.snapshot); store.diplomacy.castVote("tie-yes", vote.id, true, leader.id, store.snapshot); store.diplomacy.castVote("tie-no", vote.id, false, candidate.id, store.snapshot); assert.equal(vote.status, "failed"); assert.equal(alliance.leaderPlayerId, leader.id); });

test("expired leader term rotates deterministically to oldest officer", () => { const store = new GameStore(); const [leader, officer] = store.snapshot.players; store.diplomacy.createAlliance("term-create", "Terms", "TRM", leader.id, store.snapshot); const alliance = store.snapshot.alliances[0]; store.diplomacy.joinAlliance("term-join", alliance.id, officer.id, store.snapshot); store.diplomacy.manageMember("term-promote", officer.id, "promote", leader.id, store.snapshot); alliance.leaderTermStartedAt = new Date(0).toISOString(); assert.equal(store.diplomacy.tick(store.snapshot), true); assert.equal(alliance.leaderPlayerId, officer.id); assert.equal(alliance.members.find(member => member.playerId === leader.id)?.role, "officer"); });

test("duplicate treaty proposals are rejected in either player order", () => { const store = new GameStore(); const [first, second] = store.snapshot.players; store.diplomacy.proposeTreaty("dup-first", second.id, "trade_pact", 100, first.id, store.snapshot); assert.throws(() => store.diplomacy.proposeTreaty("dup-second", first.id, "trade_pact", 100, second.id, store.snapshot), /TREATY_ALREADY_PENDING/); });

test("frozen alliance members cannot be promoted or nominated", () => { const store = new GameStore(); const [leader, member] = store.snapshot.players; store.diplomacy.createAlliance("freeze-create", "Frozen Council", "FRZ", leader.id, store.snapshot); const alliance = store.snapshot.alliances[0]; store.diplomacy.joinAlliance("freeze-join", alliance.id, member.id, store.snapshot); store.setPlayerStatus(member.id, "banned", new Date().toISOString()); assert.throws(() => store.diplomacy.manageMember("freeze-promote", member.id, "promote", leader.id, store.snapshot), /TARGET_FROZEN/); assert.throws(() => store.diplomacy.openVote("freeze-vote", member.id, leader.id, store.snapshot), /TARGET_FROZEN/); assert.equal(store.diplomacy.manageMember("freeze-kick", member.id, "kick", leader.id, store.snapshot), "accepted"); });

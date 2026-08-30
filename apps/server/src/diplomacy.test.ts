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


import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";
import { campaignMissions, commanderCapacity, type Army, type TroopType } from "@kingdoms/shared";

// A new player fields troops through the real economy: barracks recruit into
// the reserve, then the army is reshaped through updateComposition (the same
// command the client sends), which swaps troops with the reserve and enforces
// the commander's capacity. No strength is injected anywhere — the point of
// these tests is that the campaign is winnable from a legal new-player state.
function fieldArmy(store: GameStore, playerId: string, army: Army, front: number, back: number, tag: string): void {
  const city = store.snapshot.cities.find(item => item.playerId === playerId)!;
  city.buildings.barracks = 1;
  city.resources = { food: 100_000, wood: 100_000, stone: 100_000, iron: 100_000 };
  // Between sorties the player rests: combat ticks regenerate morale (+2 while
  // supplied), which is what the minutes between missions do for a real player.
  for (let index = 0; index < 35 && army.morale < 100; index++) store.combat.tick(store.snapshot);
  const currentOf = (troopType: TroopType) =>
    (["frontline", "backline", "flank"] as const).reduce((sum, position) =>
      army.composition?.[position]?.troopType === troopType ? sum + army.composition[position]!.count : sum, 0);
  for (const [troopType, want] of [["shield_infantry", front], ["archers", back]] as const) {
    const missing = want - currentOf(troopType);
    if (missing > 0) {
      store.armyManagement.recruitReserve(`recruit-${tag}-${troopType}`, city.id, troopType, missing, playerId, store.snapshot);
      // The recruit rides the one-slot training queue — wait out the drill
      // before asking for the next troop type.
      store.armyManagement.tick(store.snapshot, Date.now() + 60_000);
    }
  }
  store.armyManagement.updateComposition(`reshape-${tag}`, army.id, {
    frontline: { id: `${army.id}-frontline`, troopType: "shield_infantry", position: "frontline", count: front },
    backline: { id: `${army.id}-backline`, troopType: "archers", position: "backline", count: back },
    flank: null,
  }, "balanced", playerId, store.snapshot);
}

test("research is queued behind an academy and unlocks after completion", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  city.buildings.academy = 1;
  store.progression.startResearch("research-start-1", "crop_rotation", player.id, store.snapshot);
  assert.equal(store.snapshot.researchQueues[player.id]!.items.length, 1);
  store.snapshot.researchQueues[player.id]!.items[0]!.completesAt = new Date(0).toISOString();
  store.armyManagement.tick(store.snapshot, Date.now());
  assert.deepEqual(store.snapshot.technologyProgress[player.id]!.unlocked, ["crop_rotation"]);
  assert.equal(store.snapshot.researchQueues[player.id]!.items.length, 0);
});

test("campaign completion is server verified and grants first-clear XP once", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  // The seeded army is a legal new-player force: one starter commander, 100 troops.
  assert.equal(army.strength, 100);
  const commander = store.snapshot.commanders.find(item => item.id === army.commanderId)!;
  const before = commander.xp;
  const mission = campaignMissions[0]!;
  const result = store.progression.completeMission("campaign-complete-1", mission.id, army.id, player.id, store.snapshot);
  assert.equal(result.victor, "attacker", "the opening mission must be winnable with the starter army");
  assert.ok(store.snapshot.campaignProgress[player.id]!.completedMissionIds.includes(mission.id));
  assert.ok(commander.xp !== before || commander.level > 1);
  assert.equal(store.snapshot.armies.filter(item => item.sourceWorldEventId === `campaign:${mission.id}`).length, 0);
});

test("specialist commanders unlock only after their chapter is cleared", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  const initialCount = store.snapshot.commanders.filter(item => item.ownerPlayerId === player.id).length;
  assert.equal(initialCount, 1);
  for (const mission of campaignMissions.filter(item => item.chapter === 1)) {
    fieldArmy(store, player.id, army, 70, 30, mission.id);
    const result = store.progression.completeMission(`unlock-${mission.id}-cmd`, mission.id, army.id, player.id, store.snapshot);
    assert.equal(result.victor, "attacker", `mission ${mission.id} must be winnable for a new player`);
  }
  assert.ok(store.snapshot.commanders.some(item => item.ownerPlayerId === player.id && item.specialty === "infantry"));
  assert.ok(!store.snapshot.commanders.some(item => item.ownerPlayerId === player.id && item.specialty === "archer"));
});

test("a new player can clear the whole campaign without injected strength", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  const commander = store.snapshot.commanders.find(item => item.id === army.commanderId)!;
  for (const chapter of [1, 2, 3] as const) {
    for (const mission of campaignMissions.filter(item => item.chapter === chapter)) {
      const capacity = commanderCapacity(commander.level);
      const front = Math.floor(capacity * 0.7);
      const back = capacity - front;
      fieldArmy(store, player.id, army, front, back, mission.id);
      const result = store.progression.completeMission(`walk-${mission.id}`, mission.id, army.id, player.id, store.snapshot);
      assert.equal(result.victor, "attacker", `${mission.id} must be winnable at the legal capacity of ${capacity}`);
    }
  }
  assert.equal(store.snapshot.campaignProgress[player.id]!.completedMissionIds.length, campaignMissions.length);
  assert.ok(commander.level >= 2, "mission XP alone grows the commander past level 1");
});

test("an unresolved mission leaves no campaign NPC behind, even on retry", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  const mission = campaignMissions[0]!;
  // 20 troops cannot annihilate the 25-strong chapter-1 opponent in 10 rounds,
  // so the sortie ends unresolved — exactly the case that used to strand the
  // surviving NPC in the shared world.
  fieldArmy(store, player.id, army, 20, 0, "weak");
  const campaignNpcs = () => store.snapshot.armies.filter(item => item.sourceWorldEventId?.startsWith("campaign:"));
  const first = store.progression.completeMission("retry-campaign-1", mission.id, army.id, player.id, store.snapshot);
  assert.notEqual(first.victor, "attacker", "a 20-troop force must not clear the opening mission");
  assert.equal(campaignNpcs().length, 0, "the surviving mission NPC must not linger in the shared world");
  const second = store.progression.completeMission("retry-campaign-2", mission.id, army.id, player.id, store.snapshot);
  assert.notEqual(second.victor, "attacker");
  assert.equal(campaignNpcs().length, 0, "retrying must not stack another copy of the NPC");
});

test("an unresolved patrol also leaves no NPC behind", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  for (const mission of campaignMissions) {
    const progress = store.snapshot.campaignProgress[player.id] ??= { playerId: player.id, completedMissionIds: [], claimedFirstClearIds: [], unlockedChapter: 1 };
    progress.completedMissionIds.push(mission.id);
    progress.claimedFirstClearIds.push(mission.id);
  }
  fieldArmy(store, player.id, army, 20, 0, "weak-patrol");
  const result = store.progression.patrol("patrol-cleanup-1", campaignMissions[0]!.id, army.id, player.id, store.snapshot);
  assert.notEqual(result.victor, "attacker", "a 20-troop force must not clear a patrol");
  assert.equal(store.snapshot.armies.filter(item => item.sourceWorldEventId?.startsWith("patrol:")).length, 0, "the surviving patrol NPC must not linger either");
});

test("patrol remains repeatable after the campaign and awards combat XP", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  for (const mission of campaignMissions) {
    const progress = store.snapshot.campaignProgress[player.id] ??= { playerId: player.id, completedMissionIds: [], claimedFirstClearIds: [], unlockedChapter: 1 };
    progress.completedMissionIds.push(mission.id);
    progress.claimedFirstClearIds.push(mission.id);
  }
  const commander = store.snapshot.commanders.find(item => item.id === army.commanderId)!;
  const before = commander.xp;
  const result = store.progression.patrol("patrol-test-1", campaignMissions[0]!.id, army.id, player.id, store.snapshot);
  assert.equal(result.status, "accepted");
  assert.ok(commander.xp !== before || commander.level > 1);
});

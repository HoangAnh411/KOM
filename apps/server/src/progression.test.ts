import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";
import { campaignMissions, commanderCapacity, gameRules, type Army, type CampaignMission, type TroopType } from "@kingdoms/shared";
import { fullExploration } from "./exploration.js";

// A new player fields troops through the real economy: barracks recruit into
// the reserve, then the army is reshaped through updateComposition (the same
// command the client sends), which swaps troops with the reserve and enforces
// the commander's capacity. No strength is injected anywhere — the point of
// these tests is that the campaign is winnable from a legal new-player state.
function fieldArmy(store: GameStore, playerId: string, army: Army, front: number, back: number, tag: string): void {
  const city = store.snapshot.cities.find(item => item.playerId === playerId)!;
  city.buildings.barracks = 1;
  city.resources = { food: 100_000, wood: 100_000, stone: 100_000, iron: 100_000 };
  // Sorties happen at mission targets now, so between missions the army marches
  // home to resupply — recruiting and reshaping both require it back at base.
  army.x = city.x;
  army.y = city.y;
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

/** March the army onto the mission's objective. Missions live at real spots on the world now;
 *  an army standing on the target has also revealed it (reveal radius 14 covers arrival slack). */
function moveToTarget(army: Army, mission: CampaignMission): void {
  army.x = mission.target.x;
  army.y = mission.target.y;
}

/** Meet a non-combat condition the way the game state would: buildings on the player's city for
 *  build, the same throughput counters a delivered caravan writes for trade. Scout needs nothing —
 *  walking to the target satisfies it. */
function satisfyCondition(store: GameStore, playerId: string, mission: CampaignMission): void {
  const condition = mission.condition;
  if (!condition) return;
  if (condition.type === "build") {
    const city = store.snapshot.cities.find(item => item.playerId === playerId)!;
    city.buildings[condition.buildingId] = Math.max(city.buildings[condition.buildingId] ?? 0, condition.level);
  } else if (condition.type === "trade") {
    const throughput = store.logistics.snapshot().throughput[playerId] ??= { wood: 0, stone: 0, iron: 0 };
    throughput.wood += condition.amount;
  }
}

/** Mark the whole campaign done in progress records — the precondition for patrol. */
function completeAllMissions(store: GameStore, playerId: string): void {
  for (const mission of campaignMissions) {
    const progress = store.snapshot.campaignProgress[playerId] ??= { playerId, completedMissionIds: [], claimedFirstClearIds: [], unlockedChapter: 1 };
    progress.completedMissionIds.push(mission.id);
    progress.claimedFirstClearIds.push(mission.id);
  }
}

test("research is queued behind an academy and unlocks after completion", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  city.buildings.academy = 1;
  store.progression.startResearch("research-start-1", "crop_rotation", player.id, store.snapshot);
  assert.equal(store.snapshot.researchQueues[player.id]!.items.length, 1);
  store.snapshot.researchQueues[player.id]!.items[0]!.completesAt = new Date(0).toISOString();
  store.tick();
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
  moveToTarget(army, mission);
  const result = store.progression.completeMission("campaign-complete-1", mission.id, army.id, player.id, store.snapshot);
  assert.equal(result.victor, "attacker", "the opening mission must be winnable with the starter army");
  assert.ok(store.snapshot.campaignProgress[player.id]!.completedMissionIds.includes(mission.id));
  assert.ok(commander.xp !== before || commander.level > 1);
  assert.equal(store.snapshot.armies.filter(item => item.sourceWorldEventId === `campaign:${mission.id}`).length, 0);
});

test("a sortie away from the objective is refused until the army arrives", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  // Lift the fog entirely so the refusal below is about distance, not exploration.
  store.snapshot.explorationMasks[player.id] = fullExploration();
  const mission = campaignMissions[0]!;
  assert.throws(() => store.progression.completeMission("away-1", mission.id, army.id, player.id, store.snapshot), /MISSION_TARGET_NOT_REACHED/);
  assert.equal(store.snapshot.campaignProgress[player.id]!.completedMissionIds.length, 0);
  assert.equal(store.snapshot.armies.filter(item => item.sourceWorldEventId?.startsWith("campaign:")).length, 0, "a refused sortie must not spawn the NPC");
  // The arrival radius is Manhattan: three tiles off still counts as arrived.
  army.x = mission.target.x + 2;
  army.y = mission.target.y + 1;
  const result = store.progression.completeMission("away-2", mission.id, army.id, player.id, store.snapshot);
  assert.equal(result.victor, "attacker", "within the arrival radius the sortie proceeds");
  // And a combat mission without an army id never gets past the guard.
  const second = campaignMissions[1]!;
  assert.throws(() => store.progression.completeMission("away-3", second.id, undefined, player.id, store.snapshot), /ARMY_REQUIRED/);
});

test("the scout mission needs its target explored, then pays resources instead of XP", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  const mission = campaignMissions.find(item => item.id === "chapter-1-scout")!;
  assert.equal(mission.kind, "scout");
  // A fresh account sees only the halo around its city and army. The seeded city
  // sits at (58,58) — 14 tiles from the target, inside that halo — so move both
  // far away first; a player who actually settled next to the objective has
  // legitimately already scouted it, but this test needs the fog case.
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  city.x = 200;
  city.y = 200;
  army.x = 200;
  army.y = 200;
  assert.throws(() => store.progression.completeMission("scout-1", mission.id, undefined, player.id, store.snapshot), /MISSION_TARGET_UNEXPLORED/);
  // Walking an army onto the target reveals it (radius 14 around armies).
  moveToTarget(army, mission);
  const before = { ...city.resources };
  const result = store.progression.completeMission("scout-2", mission.id, undefined, player.id, store.snapshot);
  assert.equal(result.status, "accepted");
  assert.equal(result.victor, "none", "no battle happens on a scout mission");
  assert.ok(store.snapshot.campaignProgress[player.id]!.completedMissionIds.includes(mission.id));
  const reward = mission.rewardResources!;
  assert.equal(city.resources.wood - before.wood, reward.wood);
  assert.equal(city.resources.stone - before.stone, reward.stone);
  assert.equal(city.resources.iron - before.iron, reward.iron);
});

test("build and trade missions read durable state before completing", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  for (const mission of campaignMissions.filter(item => item.chapter === 1)) {
    const progress = store.snapshot.campaignProgress[player.id] ??= { playerId: player.id, completedMissionIds: [], claimedFirstClearIds: [], unlockedChapter: 1 };
    progress.completedMissionIds.push(mission.id);
    progress.claimedFirstClearIds.push(mission.id);
  }
  store.snapshot.explorationMasks[player.id] = fullExploration();
  store.snapshot.campaignProgress[player.id]!.unlockedChapter = 2;
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  const build = campaignMissions.find(item => item.id === "chapter-2-road")!;
  const trade = campaignMissions.find(item => item.id === "chapter-2-escort")!;

  const before = { ...city.resources };
  assert.throws(() => store.progression.completeMission("build-1", build.id, undefined, player.id, store.snapshot), /MISSION_CONDITION_UNMET/);
  satisfyCondition(store, player.id, build); // road_depot level 1
  const built = store.progression.completeMission("build-2", build.id, undefined, player.id, store.snapshot);
  assert.equal(built.status, "accepted");
  assert.equal(city.resources.wood - before.wood, build.rewardResources!.wood, "the build mission pays its reward into the city");

  const afterBuild = { ...city.resources };
  assert.throws(() => store.progression.completeMission("trade-1", trade.id, undefined, player.id, store.snapshot), /MISSION_CONDITION_UNMET/);
  satisfyCondition(store, player.id, trade); // 100 resources delivered
  const traded = store.progression.completeMission("trade-2", trade.id, undefined, player.id, store.snapshot);
  assert.equal(traded.status, "accepted");
  assert.equal(city.resources.stone - afterBuild.stone, trade.rewardResources!.stone, "the trade mission pays its reward into the city");
});

test("specialist commanders unlock only after their chapter is cleared", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  const initialCount = store.snapshot.commanders.filter(item => item.ownerPlayerId === player.id).length;
  assert.equal(initialCount, 1);
  for (const mission of campaignMissions.filter(item => item.chapter === 1)) {
    if (mission.kind === "combat") {
      fieldArmy(store, player.id, army, 70, 30, mission.id);
      moveToTarget(army, mission);
      const result = store.progression.completeMission(`unlock-${mission.id}-cmd`, mission.id, army.id, player.id, store.snapshot);
      assert.equal(result.victor, "attacker", `mission ${mission.id} must be winnable for a new player`);
    } else {
      // Chapter 1's scout mission: walk there, no army id needed.
      moveToTarget(army, mission);
      const result = store.progression.completeMission(`unlock-${mission.id}-cmd`, mission.id, undefined, player.id, store.snapshot);
      assert.equal(result.status, "accepted");
    }
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
      if (mission.kind === "combat") {
        const capacity = commanderCapacity(commander.level);
        const front = Math.floor(capacity * 0.7);
        const back = capacity - front;
        fieldArmy(store, player.id, army, front, back, mission.id);
        moveToTarget(army, mission);
        const result = store.progression.completeMission(`walk-${mission.id}`, mission.id, army.id, player.id, store.snapshot);
        assert.equal(result.victor, "attacker", `${mission.id} must be winnable at the legal capacity of ${capacity}`);
      } else {
        moveToTarget(army, mission);
        satisfyCondition(store, player.id, mission);
        const result = store.progression.completeMission(`walk-${mission.id}`, mission.id, undefined, player.id, store.snapshot);
        assert.equal(result.status, "accepted", `${mission.id} completes on its condition without a battle`);
      }
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
  moveToTarget(army, mission);
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
  completeAllMissions(store, player.id);
  fieldArmy(store, player.id, army, 20, 0, "weak-patrol");
  const result = store.progression.patrol("patrol-cleanup-1", campaignMissions[0]!.id, army.id, player.id, store.snapshot);
  assert.notEqual(result.victor, "attacker", "a 20-troop force must not clear a patrol");
  assert.equal(store.snapshot.armies.filter(item => item.sourceWorldEventId?.startsWith("patrol:")).length, 0, "the surviving patrol NPC must not linger either");
});

test("patrol victories pay chapter resources to the home city; draws pay nothing", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  completeAllMissions(store, player.id);
  const city = store.snapshot.cities.find(item => item.id === army.homeCityId) ?? store.snapshot.cities.find(item => item.playerId === player.id)!;
  fieldArmy(store, player.id, army, 70, 30, "patrol-win");
  const before = { ...city.resources };
  const won = store.progression.patrol("patrol-reward-1", campaignMissions[0]!.id, army.id, player.id, store.snapshot);
  assert.equal(won.victor, "attacker", "a legal 100-troop force clears a chapter-1 patrol");
  const reward = gameRules.campaign.patrolRewards[1];
  assert.equal(city.resources.wood - before.wood, reward.wood, "the patrol reward lands in the home city");
  assert.equal(city.resources.stone - before.stone, reward.stone);
  assert.equal(city.resources.iron - before.iron, reward.iron);

  // A draw pays nothing: 20 troops cannot clear the chapter-1 opponent. The
  // second fieldArmy resets the city's resources, so the comparison starts
  // from a snapshot taken after it.
  fieldArmy(store, player.id, army, 20, 0, "patrol-draw");
  const beforeDraw = { ...city.resources };
  const drew = store.progression.patrol("patrol-reward-2", campaignMissions[0]!.id, army.id, player.id, store.snapshot);
  assert.notEqual(drew.victor, "attacker");
  assert.deepEqual({ wood: city.resources.wood, stone: city.resources.stone, iron: city.resources.iron }, { wood: beforeDraw.wood, stone: beforeDraw.stone, iron: beforeDraw.iron }, "an unresolved patrol pays no reward");
});

test("patrol remains repeatable after the campaign and awards combat XP", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  completeAllMissions(store, player.id);
  const commander = store.snapshot.commanders.find(item => item.id === army.commanderId)!;
  const before = commander.xp;
  const result = store.progression.patrol("patrol-test-1", campaignMissions[0]!.id, army.id, player.id, store.snapshot);
  assert.equal(result.status, "accepted");
  assert.ok(commander.xp !== before || commander.level > 1);
});

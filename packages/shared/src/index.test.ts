import test from "node:test";
import assert from "node:assert/strict";
import { overallScore, militaryScore, gameRules, recruitmentCost, snapshotSchema, worldEventSchema, PROTOCOL_VERSION, regionTileCounts, regions, buildCommandSchema, cityGridSize, buildingDimensions, validatePlacements, migrateCityLayoutV1toV2, campaignMissions, campaignMissionKinds, dailyQuests, selectDailyQuestIds, dailyQuestDayKey, dailyQuestRefreshesAt, dailyQuestClaimCommandSchema } from "./index.js";

test("season score uses the published weights", () => {
  assert.equal(overallScore({ military: 1000, economy: 1000, diplomacy: 1000 }), 1000);
  assert.equal(overallScore({ military: 100, economy: 200, diplomacy: 300 }), 185);
});

test("military score calculation", () => {
  // `tilesControlled` used to be 100 here, which maxed the territory term under the old flat
  // rate of 5 points a tile. That rate saturated at 60 tiles — less than one of the sixteen
  // provinces — so the fixture for "everything maxed" is now the tile count that actually means
  // maxed: a quarter of the world.
  assert.equal(militaryScore({ victories: 10, draws: 0, tilesControlled: gameRules.territory.fullScoreTiles, successfulDefenses: 10 }), 1000);
  const oneProvince = gameRules.territory.fullScoreTiles / 4;
  assert.equal(militaryScore({ victories: 2, draws: 1, tilesControlled: oneProvince, successfulDefenses: 1 }), 225); // 110 + 75 (one province) + 40
});

// The scale, checked against the map it is scaled against. Holding one of the sixteen provinces
// is a quarter of the way to the cap; under the old rate it *was* the cap (79 × 5 = 395, clamped
// to 300), which made three tenths of the military axis a switch with two positions.
test("one province is worth about 75 territory points, not the whole 300", () => {
  const counts = regionTileCounts();
  const territoryOnly = (tilesControlled: number) => militaryScore({ victories: 0, draws: 0, tilesControlled, successfulDefenses: 0 });
  for (const region of regions) {
    const score = territoryOnly(counts[region.code]!);
    assert.ok(score >= 70 && score <= 80, `${region.name} (${counts[region.code]} ô) pays ${score}, expected about 75`);
  }
  assert.equal(territoryOnly(gameRules.territory.fullScoreTiles), 300, "a quarter of the world is the full territory score");
  assert.equal(territoryOnly(gameRules.territory.fullScoreTiles * 2), 300, "and there is nothing above it");
  assert.equal(gameRules.territory.fullScoreTiles, (gameRules.map.extent * gameRules.map.extent) / 4);
});

test("recruitment is priced per 10-troop pack, matching the server charge", () => {
  const step = gameRules.army.recruitAmountStep;
  const infantry = gameRules.recruitment.infantry.cost;
  assert.deepEqual(recruitmentCost("infantry", step), infantry);
  assert.deepEqual(recruitmentCost("infantry", step * 5), { wood: infantry.wood * 5, stone: infantry.stone * 5, iron: infantry.iron * 5 });
  assert.equal(gameRules.recruitment.infantry.cost.wood, 50);
});

test("town hall levels expand the authoritative city grid up to its cap", () => {
  assert.equal(cityGridSize(1), 12);
  assert.equal(cityGridSize(2), 14);
  assert.equal(cityGridSize(5), 20);
  assert.equal(cityGridSize(99), 20);
});

test("a build plot must provide both coordinates, and rotation only with coordinates", () => {
  const base = { commandId: "command-plot-1", cityId: "city-1", buildingId: "warehouse", queueType: "build" };
  assert.equal(buildCommandSchema.safeParse({ ...base, plotX: 1 }).success, false);
  assert.equal(buildCommandSchema.safeParse({ ...base, plotX: 1, plotY: 3 }).success, true);
  assert.equal(buildCommandSchema.safeParse({ ...base, plotX: 1, plotY: 3, plotRotation: 90 }).success, true);
  assert.equal(buildCommandSchema.safeParse({ ...base, plotRotation: 90 }).success, false);
  assert.equal(buildCommandSchema.safeParse({ ...base, plotX: 1, plotY: 3, plotRotation: 45 }).success, false);
});

test("footprint dimensions and rotation swap width and height for 90 and 270 degrees", () => {
  assert.deepEqual(buildingDimensions("road_depot", 0), { width: 3, height: 2 });
  assert.deepEqual(buildingDimensions("road_depot", 90), { width: 2, height: 3 });
  assert.deepEqual(buildingDimensions("road_depot", 180), { width: 3, height: 2 });
  assert.deepEqual(buildingDimensions("road_depot", 270), { width: 2, height: 3 });
  assert.deepEqual(buildingDimensions("town_hall", 90), { width: 3, height: 3 });
});

test("validatePlacements detects out-of-bounds, overlaps, and invalid rotations", () => {
  const valid = [
    { buildingId: "town_hall" as const, x: 4, y: 4, rotation: 0 as const },
    { buildingId: "warehouse" as const, x: 0, y: 0, rotation: 0 as const },
    { buildingId: "road_depot" as const, x: 8, y: 4, rotation: 90 as const }, // 2 wide, 3 high -> x: 8..9, y: 4..6
  ];
  assert.deepEqual(validatePlacements(valid, 12), { valid: true });

  // Out of bounds
  const outOfBounds = [{ buildingId: "barracks" as const, x: 10, y: 10, rotation: 0 as const }]; // 3x3 at 10 -> reaches 13 > 12
  assert.equal(validatePlacements(outOfBounds, 12).error, "CITY_PLOT_OUT_OF_BOUNDS");

  // Overlap
  const overlap = [
    { buildingId: "town_hall" as const, x: 4, y: 4, rotation: 0 as const },
    { buildingId: "warehouse" as const, x: 5, y: 5, rotation: 0 as const },
  ];
  assert.equal(validatePlacements(overlap, 12).error, "CITY_PLOT_OCCUPIED");
});

test("migrateCityLayoutV1toV2 deterministically projects v1 layout into v2 grid", () => {
  const legacyCity = {
    buildings: { town_hall: 1, warehouse: 1 },
    buildingPlots: [
      { buildingId: "town_hall" as const, x: 2, y: 2 },
      { buildingId: "warehouse" as const, x: 1, y: 2 },
    ],
  };
  const migrated = migrateCityLayoutV1toV2(legacyCity);
  assert.equal(migrated.length, 2);
  const th = migrated.find(p => p.buildingId === "town_hall")!;
  assert.deepEqual(th, { buildingId: "town_hall", x: 4, y: 4, rotation: 0 });
  const wh = migrated.find(p => p.buildingId === "warehouse")!;
  assert.ok(wh.x >= 0 && wh.y >= 0 && wh.rotation === 0);
  assert.deepEqual(validatePlacements(migrated, 12), { valid: true });
});

// The snapshot used to carry the world tile by tile. Both sides now import the authored
// map from `world-map.ts`, so the contract only has to *name* which world it is
// (`worldMapDigest`) and list what the DB says differs from it (`terrainOverrides`).
test("the snapshot contract names the world instead of carrying it", () => {
  const keys = Object.keys(snapshotSchema.shape);
  assert.ok(!keys.includes("terrainMap"), "the tile-by-tile grid is off the wire");
  assert.ok(keys.includes("worldMapDigest") && keys.includes("terrainOverrides"), "what replaced it");
  assert.ok(keys.includes("world") && keys.includes("exploration"), "the 3D asset world and seasonal fog are explicit protocol fields");
});

test("PROTOCOL_VERSION is 4 for the 256 world descriptor and seasonal exploration", () => {
  assert.equal(PROTOCOL_VERSION, 4);
});

test("periodic world-event and territory revision fields are additive", () => {
  const legacyEvent = { id: "event", kingdomId: "kingdom", eventType: "plague", affectedTiles: [], modifier: {}, startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2026-01-01T00:10:00.000Z", severity: 1 };
  assert.equal(worldEventSchema.parse(legacyEvent).lastPlagueAt, undefined);
  assert.equal(worldEventSchema.parse({ ...legacyEvent, lastPlagueAt: legacyEvent.startsAt }).lastPlagueAt, legacyEvent.startsAt);
  assert.equal(snapshotSchema.shape.regionControlRevision.safeParse(undefined).success, true);
  assert.equal(snapshotSchema.shape.regionControlRevision.safeParse(3).success, true);
});

// The campaign is not 12 abstract combat calls any more: every mission pins a target on the
// authored world, three of them are non-combat, and each non-combat mission carries exactly the
// condition kind the design assigned it. These invariants are what the map pins, the arrival
// check and the condition checks are all written against.
test("campaign missions carry map targets, one per mission, inside the world", () => {
  const extent = gameRules.map.extent;
  const seen = new Set<string>();
  for (const mission of campaignMissions) {
    const { x, y } = mission.target;
    assert.ok(x >= 0 && x < extent && y >= 0 && y < extent, `${mission.id} target (${x}, ${y}) is outside the ${extent}x${extent} world`);
    const key = `${x}:${y}`;
    assert.ok(!seen.has(key), `missions share target ${key}`);
    seen.add(key);
    assert.ok(campaignMissionKinds.includes(mission.kind), `${mission.id} has unknown kind`);
  }
});

test("the three non-combat missions each carry their own condition kind, and combat carries none", () => {
  const byKind = new Map(campaignMissions.map(mission => [mission.kind, mission]));
  for (const kind of ["scout", "build", "trade"] as const) {
    const mission = byKind.get(kind)!;
    assert.equal(mission.condition?.type, kind, `${mission.id} must be the ${kind} condition mission`);
    assert.ok(mission.rewardResources, `${mission.id} pays resources instead of XP`);
  }
  for (const mission of campaignMissions.filter(item => item.kind === "combat")) {
    assert.equal(mission.condition, undefined, `${mission.id} is combat and must not carry a condition`);
  }
});

test("patrol rewards are priced for all three chapters", () => {
  const rewards = gameRules.campaign.patrolRewards;
  for (const chapter of [1, 2, 3] as const) {
    const reward = rewards[chapter];
    assert.ok(reward.wood > 0 && reward.stone > 0 && reward.iron >= 0, `chapter ${chapter} patrol reward is set`);
    if (chapter > 1) {
      const previous = rewards[(chapter - 1) as 1 | 2];
      assert.ok(reward.wood > previous.wood, "later chapters patrol for more");
    }
  }
});

test("a day's quest selection is deterministic, three easy plus both medium plus the hard, 10 points", () => {
  for (const dayKey of ["2026-09-07", "2026-09-08", "2026-12-31", "2027-01-01"]) {
    const first = selectDailyQuestIds(dayKey);
    const second = selectDailyQuestIds(dayKey);
    assert.deepEqual(second, first, `${dayKey} re-rolls differently on the same input`);
    assert.equal(first.length, 6, `${dayKey} selects six quests`);
    const easy = first.filter(id => dailyQuests.find(quest => quest.id === id)!.difficulty === "easy");
    assert.equal(easy.length, 3, `${dayKey} draws exactly three easy quests`);
    const points = first.reduce((sum, id) => sum + dailyQuests.find(quest => quest.id === id)!.points, 0);
    assert.equal(points, 10, `${dayKey} quests must total the 10 milestone points`);
    assert.ok(first.includes("daily_spy"), `${dayKey} must include the hard spy quest`);
    assert.ok(first.includes("daily_battle") && first.includes("daily_campaign"), `${dayKey} must include both medium quests`);
    assert.ok(new Set(first).size === first.length, `${dayKey} repeats a quest id`);
    // Every selected id is a catalog entry — the client joins ids against this
    // catalog to render, so a stray id is an invisible row.
    for (const id of first) assert.ok(dailyQuests.some(quest => quest.id === id), `${id} is not in the catalog`);
  }
  // Different days may share a selection, but at least one of these four must
  // differ — otherwise the shuffle is a constant and variety is gone.
  const selections = new Set(["2026-09-07", "2026-09-08", "2026-12-31", "2027-01-01"].map(dayKey => selectDailyQuestIds(dayKey).join(",")));
  assert.ok(selections.size > 1, "the easy draw never changes across days");
});

test("the day key and refresh instant flip together at the UTC midnight boundary", () => {
  const late = Date.parse("2026-09-07T23:59:59.999Z");
  const early = Date.parse("2026-09-08T00:00:00.000Z");
  assert.equal(dailyQuestDayKey(late), "2026-09-07");
  assert.equal(dailyQuestDayKey(early), "2026-09-08");
  assert.equal(dailyQuestRefreshesAt(late), "2026-09-08T00:00:00.000Z");
  assert.equal(dailyQuestRefreshesAt(early), "2026-09-09T00:00:00.000Z");
  // The refresh instant always lands strictly in the future and exactly one day out.
  const noon = Date.parse("2026-09-07T12:00:00.000Z");
  assert.equal(Date.parse(dailyQuestRefreshesAt(noon)) - noon, 43_200_000);
});

test("a daily quest claim command names exactly one target, a quest or a milestone", () => {
  assert.equal(dailyQuestClaimCommandSchema.safeParse({ commandId: "12345678", questId: "daily_harvest" }).success, true);
  assert.equal(dailyQuestClaimCommandSchema.safeParse({ commandId: "12345678", milestone: 5 }).success, true);
  assert.equal(dailyQuestClaimCommandSchema.safeParse({ commandId: "12345678", milestone: 10 }).success, true);
  assert.equal(dailyQuestClaimCommandSchema.safeParse({ commandId: "12345678" }).success, false, "no target must be rejected");
  assert.equal(dailyQuestClaimCommandSchema.safeParse({ commandId: "12345678", questId: "daily_harvest", milestone: 5 }).success, false, "two targets must be rejected");
  assert.equal(dailyQuestClaimCommandSchema.safeParse({ commandId: "12345678", milestone: 7 }).success, false, "an unknown milestone must be rejected");
});

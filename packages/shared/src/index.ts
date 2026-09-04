import { z } from "zod";

export const factionIds = ["meridian", "bastion", "ravager", "veiled"] as const;
export type FactionId = (typeof factionIds)[number];

export const factions: Record<FactionId, { name: string; description: string }> = {
  meridian: { name: "Meridian League", description: "Thương mại và caravan hiệu quả." },
  bastion: { name: "Bastion Covenant", description: "Phòng thủ thành phố và hồi phục." },
  ravager: { name: "Ravager Clans", description: "Cơ động và phục kích logistics." },
  veiled: { name: "Veiled Concord", description: "Tình báo và ngoại giao." }
};

// === MAP SIZE ===
//
// The world is a square grid of `mapExtent × mapExtent` tiles, coordinates
// `[0..mapExtent-1]` on both axes. This is the only place that number is written
// down: the server's terrain seed, its raider and world-event spawn scans, the
// client's hit test and terrain texture, and the move-command validator all read
// it back off `gameRules.map`, so resizing the world is an edit here and nowhere
// else. That drift is not hypothetical — the same 20 used to be spelled out in
// eight places, and `map-size.test.ts` now scans the repo to keep it at one.
const mapExtent = 20;

// Tiles kept clear of the world edge. A city needs room for its
// `minDistanceBetweenCities` ring and a world event for its five-tile cross, so
// both windows inset by this much instead of each carrying its own bounds.
const placementMargin = 2;

export const resourceSchema = z.object({ food: z.number().int().nonnegative(), wood: z.number().int().nonnegative(), stone: z.number().int().nonnegative(), iron: z.number().int().nonnegative() });
export type Resources = z.infer<typeof resourceSchema>;

export const scoreSchema = z.object({ military: z.number().int().min(0).max(1000), economy: z.number().int().min(0).max(1000), diplomacy: z.number().int().min(0).max(1000), overall: z.number().min(0) });
export type Scores = z.infer<typeof scoreSchema>;

export const citySchema = z.object({ id: z.string(), playerId: z.string(), playerName: z.string(), name: z.string(), x: z.number().int(), y: z.number().int(), resources: resourceSchema, buildings: z.record(z.number().int().positive()), queues: z.array(z.object({ id: z.string(), type: z.enum(["build", "research"]), buildingId: z.string(), targetLevel: z.number().int(), completesAt: z.string() })), frozen: z.boolean().optional(), frozenAt: z.string().optional() });
export type City = z.infer<typeof citySchema>;

export const destinationKinds = ["city", "market"] as const;
export type DestinationKind = (typeof destinationKinds)[number];

export const caravanSchema = z.object({ id: z.string(), ownerPlayerId: z.string(), sourceCityId: z.string(), destinationKind: z.enum(destinationKinds).default("city"), destinationCityId: z.string().nullable(), destinationMarketId: z.string().optional(), progress: z.number().min(0).max(1), status: z.enum(["moving", "delivered", "ambushed"]), routeId: z.string().optional(), cargo: resourceSchema.optional(), departureAt: z.string().optional(), arrivesAt: z.string().optional(), escortArmyId: z.string().optional(), ambushSeed: z.number().int().nonnegative().optional(), frozen: z.boolean().optional(), frozenAt: z.string().optional() });
export type Caravan = z.infer<typeof caravanSchema>;
export const resourceNodeSchema = z.object({ id: z.string(), kingdomId: z.string(), regionId: z.string(), x: z.number().int(), y: z.number().int(), resourceType: z.enum(['wood', 'stone', 'iron']), remaining: z.number().int().nonnegative(), capacity: z.number().int().positive(), recoveryRate: z.number().int().nonnegative() });
export type ResourceNode = z.infer<typeof resourceNodeSchema>;
export const depotSchema = z.object({ cityId: z.string(), level: z.number().int().positive(), capacity: z.number().int().positive() });
export type Depot = z.infer<typeof depotSchema>;
export const marketHubSchema = z.object({ id: z.string(), kingdomId: z.string(), name: z.string(), x: z.number().int(), y: z.number().int() });
export type MarketHub = z.infer<typeof marketHubSchema>;
export const tradeRouteSchema = z.object({ id: z.string(), kingdomId: z.string().optional(), ownerPlayerId: z.string(), sourceCityId: z.string(), destinationKind: z.enum(destinationKinds).default("city"), destinationCityId: z.string().nullable(), destinationMarketId: z.string().optional(), distance: z.number().int().nonnegative(), travelTimeSeconds: z.number().int().positive(), status: z.enum(['active', 'disabled']) });
export type TradeRoute = z.infer<typeof tradeRouteSchema>;
export const logisticsSnapshotSchema = z.object({ resourceNodes: z.array(resourceNodeSchema), depots: z.array(depotSchema), tradeRoutes: z.array(tradeRouteSchema), marketHubs: z.array(marketHubSchema).default([]), throughput: z.record(z.object({ wood: z.number().int().nonnegative(), stone: z.number().int().nonnegative(), iron: z.number().int().nonnegative() })) });
export type LogisticsSnapshot = z.infer<typeof logisticsSnapshotSchema>;

// === PHASE 3: COMBAT TYPES ===
export const unitTypes = ["infantry", "cavalry", "archer"] as const;
export type UnitType = (typeof unitTypes)[number];

export const counterMatrix: Record<UnitType, Record<UnitType, number>> = {
  infantry: { infantry: 1.0, cavalry: 0.7, archer: 1.5 },
  cavalry:  { infantry: 1.5, cavalry: 1.0, archer: 0.7 },
  archer:   { infantry: 0.7, cavalry: 1.5, archer: 1.0 },
};

export const terrainTypes = ["plains", "forest", "hills", "swamp"] as const;
export type TerrainType = (typeof terrainTypes)[number];

export const terrainModifiers: Record<TerrainType, Record<UnitType, number>> = {
  plains: { infantry: 1.0, cavalry: 1.2, archer: 1.0 },
  forest: { infantry: 1.1, cavalry: 0.7, archer: 1.3 },
  hills:  { infantry: 1.2, cavalry: 0.8, archer: 1.4 },
  swamp:  { infantry: 0.8, cavalry: 0.5, archer: 0.9 },
};

export const formations = ["line", "wedge", "square"] as const;
export type Formation = (typeof formations)[number];

export const formationModifiers: Record<Formation, { attack: number; defense: number }> = {
  line:   { attack: 1.0, defense: 1.0 },
  wedge:  { attack: 1.3, defense: 0.8 },
  square: { attack: 0.8, defense: 1.3 },
};

export const npcKinds = ["raider", "migration"] as const;
export type NpcKind = (typeof npcKinds)[number];

export const attackOrderSchema = z.object({
  id: z.string(), armyId: z.string(), targetArmyId: z.string(), seed: z.number().int().nonnegative(),
  targetX: z.number().int(), targetY: z.number().int(), issuedAt: z.string(),
});
export type AttackOrder = z.infer<typeof attackOrderSchema>;

export const armySchema = z.object({
  id: z.string(),
  ownerType: z.enum(["player", "npc"]).default("player"),
  ownerPlayerId: z.string().nullable(),
  npcKind: z.enum(npcKinds).optional(),
  sourceWorldEventId: z.string().optional(),
  nextActionAt: z.string().optional(),
  x: z.number().int(),
  y: z.number().int(),
  unitType: z.enum(unitTypes),
  strength: z.number().int().min(0).max(500),
  morale: z.number().int().min(0).max(100),
  formation: z.enum(formations),
  supply: z.number().int().min(0).max(100),
  targetX: z.number().int().optional(),
  targetY: z.number().int().optional(),
  attackOrder: attackOrderSchema.optional(),
  lastSupplyAt: z.string().optional(),
  frozen: z.boolean().optional(),
  frozenAt: z.string().optional()
});
export type Army = z.infer<typeof armySchema>;

export const heroSchema = z.object({ id: z.string(), ownerPlayerId: z.string(), name: z.string(), x: z.number().int(), y: z.number().int() });
export type Hero = z.infer<typeof heroSchema>;

export const mapTileSchema = z.object({ x: z.number().int(), y: z.number().int(), terrain: z.enum(terrainTypes) });
export type MapTile = z.infer<typeof mapTileSchema>;

const battleParticipantSchema = z.object({
  ownerType: z.enum(["player", "npc"]).default("player"),
  playerId: z.string().nullable(),
  armyId: z.string(),
  unitType: z.enum(unitTypes),
  formation: z.enum(formations),
  strengthBefore: z.number().int(),
  strengthAfter: z.number().int(),
  moraleBefore: z.number().int(),
  moraleAfter: z.number().int(),
  supplyBefore: z.number().int(),
  npcKind: z.enum(npcKinds).optional(),
});

export const battleReportSchema = z.object({
  id: z.string(),
  kingdomId: z.string(),
  seasonId: z.string(),
  tileX: z.number().int(),
  tileY: z.number().int(),
  terrain: z.enum(terrainTypes),
  attacker: battleParticipantSchema,
  defender: battleParticipantSchema,
  rounds: z.array(z.object({
    round: z.number().int(),
    attackerDamage: z.number().int(),
    defenderDamage: z.number().int(),
    attackerStrength: z.number().int(),
    defenderStrength: z.number().int(),
  })),
  victor: z.enum(["attacker", "defender", "draw"]),
  seed: z.number().int(),
  resolvedAt: z.string(),
});
export type BattleReport = z.infer<typeof battleReportSchema>;

// === PHASE 4: ALLIANCE & DIPLOMACY TYPES ===
export const allianceRoles = ["leader", "officer", "member"] as const;
export type AllianceRole = (typeof allianceRoles)[number];

export const allianceMemberSchema = z.object({
  playerId: z.string(),
  role: z.enum(allianceRoles),
  contribution: z.number().int().nonnegative(),
  joinedAt: z.string(),
});

export const allianceSchema = z.object({
  id: z.string(),
  kingdomId: z.string(),
  name: z.string().min(2).max(30),
  tag: z.string().min(2).max(5),
  leaderPlayerId: z.string(),
  members: z.array(allianceMemberSchema),
  notice: z.string().max(200).optional(),
  leaderTermStartedAt: z.string().optional(),
  createdAt: z.string(),
});
export type Alliance = z.infer<typeof allianceSchema>;

export const allianceVoteSchema = z.object({
  id: z.string(), allianceId: z.string(), candidatePlayerId: z.string(), openedByPlayerId: z.string(),
  votes: z.array(z.object({ playerId: z.string(), vote: z.boolean(), castAt: z.string() })),
  status: z.enum(["open", "passed", "failed"]), openedAt: z.string(), expiresAt: z.string(),
});
export type AllianceVote = z.infer<typeof allianceVoteSchema>;

export const treatyTypes = ["non_aggression", "trade_pact", "defensive_pact"] as const;
export type TreatyType = (typeof treatyTypes)[number];

export const treatyStatuses = ["proposed", "active", "rejected", "expired", "violated"] as const;
export type TreatyStatus = (typeof treatyStatuses)[number];

export const treatySchema = z.object({
  id: z.string(),
  kingdomId: z.string(),
  proposerPlayerId: z.string(),
  targetPlayerId: z.string(),
  treatyType: z.enum(treatyTypes),
  status: z.enum(treatyStatuses),
  durationSeconds: z.number().int().positive(),
  proposedAt: z.string(),
  acceptedAt: z.string().optional(),
  expiresAt: z.string().optional(),
});
export type Treaty = z.infer<typeof treatySchema>;

export const diplomacyStatsSchema = z.object({
  reputation: z.number().int().min(-500).max(1000),
  treatiesHonored: z.number().int().nonnegative(),
  treatiesViolated: z.number().int().nonnegative(),
  activeTreaties: z.number().int().nonnegative(),
  allianceContribution: z.number().int().nonnegative(),
  mediationCount: z.number().int().nonnegative(),
});
export type DiplomacyStats = z.infer<typeof diplomacyStatsSchema>;
// === PHASE 5: ESPIONAGE & WORLD EVENTS ===
export const spyMissionTypes = ["scout", "sabotage", "steal", "counter_intel", "misinformation"] as const;
export type SpyMissionType = (typeof spyMissionTypes)[number];
export const spyMissionStatuses = ["in_progress", "success", "failed", "intercepted"] as const;
export type SpyMissionStatus = (typeof spyMissionStatuses)[number];
export const spyMissionConfig = {
  scout: { baseCost: 50, durationSeconds: 300, cooldownSeconds: 600, baseAccuracy: 0.6 },
  sabotage: { baseCost: 150, durationSeconds: 600, cooldownSeconds: 1200, baseAccuracy: 0.4 },
  steal: { baseCost: 100, durationSeconds: 450, cooldownSeconds: 900, baseAccuracy: 0.5 },
  counter_intel: { baseCost: 80, durationSeconds: 0, cooldownSeconds: 1800, baseAccuracy: 0.7 },
  misinformation: { baseCost: 120, durationSeconds: 540, cooldownSeconds: 1800, baseAccuracy: 0.45 },
} as const;
/** How long a successful `misinformation` mission keeps feeding the target's
 *  scouts false numbers. It has to stay *below* that mission's cooldown, or a
 *  player could re-plant before the previous lie lapsed and blind an opponent
 *  permanently; with 20 minutes of effect against a 30-minute cooldown there is
 *  always a ≥10-minute honest window, and `espionage.test.ts` asserts the gap so
 *  a later balance pass cannot close it by accident. */
export const misinformationEffectSeconds = 1200;
/** The missions `/api/commands/spy/launch` accepts. `counter_intel` is not one of
 *  them — it has its own endpoint and no target — and stating the subset here
 *  rather than repeating a literal union in the schema is what keeps the client's
 *  mission picker and the server's validator from drifting apart. */
export const launchableSpyMissionTypes = ["scout", "sabotage", "steal", "misinformation"] as const satisfies ReadonlyArray<Exclude<SpyMissionType, "counter_intel">>;
export type LaunchableSpyMissionType = (typeof launchableSpyMissionTypes)[number];
export const spyMissionSchema = z.object({
  id: z.string(), kingdomId: z.string(), actorPlayerId: z.string(), targetPlayerId: z.string(),
  missionType: z.enum(spyMissionTypes), status: z.enum(spyMissionStatuses), accuracy: z.number().min(0).max(1),
  cost: z.object({ wood: z.number().nonnegative(), stone: z.number().nonnegative(), iron: z.number().nonnegative() }),
  startedAt: z.string(), completesAt: z.string(), report: z.unknown().optional(),
});
export type SpyMission = z.infer<typeof spyMissionSchema>;
export const worldEventTypes = ["drought", "plague", "earthquake", "mob_migration", "gold_rush"] as const;
export type WorldEventType = (typeof worldEventTypes)[number];
export const worldEventSchema = z.object({
  id: z.string(), kingdomId: z.string(), eventType: z.enum(worldEventTypes),
  affectedTiles: z.array(z.object({ x: z.number().int(), y: z.number().int() })),
  modifier: z.record(z.number()), startsAt: z.string(), endsAt: z.string(), severity: z.number().int().min(1).max(3), seed: z.number().int().optional(),
});
export type WorldEvent = z.infer<typeof worldEventSchema>;

// === PHASE 7B: ONBOARDING ===
export const onboardingSteps = ["city_inspected", "depot_built", "resource_harvested", "market_exported", "barracks_built", "army_recruited", "raider_defeated", "score_viewed"] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];
export const onboardableSteps = ["city_inspected", "score_viewed"] as const satisfies ReadonlyArray<OnboardingStep>;

export const onboardingProgressSchema = z.object({ variant: z.string(), completedSteps: z.array(z.enum(onboardingSteps)).default([]) });
export type OnboardingProgress = z.infer<typeof onboardingProgressSchema>;

export const onboardingAckCommandSchema = z.object({ commandId: z.string().min(8), step: z.enum(onboardableSteps) });
export type OnboardingAckCommand = z.infer<typeof onboardingAckCommandSchema>;

// Protocol version of the world snapshot contract. Clients lock game commands
// and ask for a refresh when the server speaks a different version.
export const PROTOCOL_VERSION = 1;
export const battleHistoryResponseSchema = z.object({ items: z.array(battleReportSchema), nextCursor: z.string().optional() });
export type BattleHistoryResponse = z.infer<typeof battleHistoryResponseSchema>;

export const snapshotSchema = z.object({ protocolVersion: z.number().int().default(PROTOCOL_VERSION), kingdom: z.object({ id: z.string(), name: z.string() }), season: z.object({ id: z.string(), status: z.enum(["SCHEDULED", "ACTIVE", "FINALIZING", "CLOSED"]), endsAt: z.string() }), cities: z.array(citySchema), caravans: z.array(caravanSchema), armies: z.array(armySchema), heroes: z.array(heroSchema), scores: z.record(scoreSchema), factionCatalog: z.record(z.object({ name: z.string(), description: z.string() })), logistics: logisticsSnapshotSchema, battleReports: z.array(battleReportSchema).optional(), terrainMap: z.record(z.enum(terrainTypes)).optional(), alliances: z.array(allianceSchema).optional(), allianceVotes: z.array(allianceVoteSchema).optional(), treaties: z.array(treatySchema).optional(), spyMissions: z.array(spyMissionSchema).optional(), worldEvents: z.array(worldEventSchema).optional(), onboarding: onboardingProgressSchema.optional() });
export type WorldSnapshot = z.infer<typeof snapshotSchema>;

// === PHASE 7B: COMMAND RESPONSE CONTRACT ===
export const commandResultSchema = z.enum(["accepted", "already_processed", "rejected"]);
export type CommandResult = z.infer<typeof commandResultSchema>;
export type CommandResponse<T = unknown> = {
  commandId: string;
  result: CommandResult;
  acceptedAt?: string;
  code?: string;
  message?: string;
  snapshot?: WorldSnapshot;
  data?: T;
};
export type CommandOutput<T> = { result: "accepted" | "already_processed"; data?: T };

export const buildCommandSchema = z.object({ commandId: z.string().min(8), cityId: z.string(), buildingId: z.enum(["town_hall", "warehouse", "road_depot", "barracks"]), queueType: z.enum(["build", "research"]).default("build") });
export type BuildCommand = z.infer<typeof buildCommandSchema>;
export const harvestCommandSchema = z.object({ commandId: z.string().min(8), nodeId: z.string(), cityId: z.string(), amount: z.number().int().positive().max(50) });
export const routeCommandSchema = z.object({ commandId: z.string().min(8), sourceCityId: z.string(), destinationKind: z.enum(destinationKinds).optional(), destinationId: z.string().optional(), destinationCityId: z.string().optional() }).superRefine((value, ctx) => {
  const kind = value.destinationKind ?? (value.destinationCityId ? "city" : undefined);
  if (!kind) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "destination is required" }); return; }
  if (kind === "city" ? !value.destinationId && !value.destinationCityId : !value.destinationId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "destinationId is required" });
});
export type RouteCommand = z.infer<typeof routeCommandSchema>;
export const caravanCommandSchema = z.object({ commandId: z.string().min(8), routeId: z.string(), cargo: z.object({ wood: z.number().int().nonnegative(), stone: z.number().int().nonnegative(), iron: z.number().int().nonnegative() }) });
export const escortCommandSchema = z.object({ commandId: z.string().min(8), caravanId: z.string(), armyId: z.string() });
export const ambushCommandSchema = z.object({ commandId: z.string().min(8), caravanId: z.string(), attackerPlayerId: z.string().optional() });

// === PHASE 3: COMBAT COMMAND SCHEMAS ===
export const attackCommandSchema = z.object({ commandId: z.string().min(8), armyId: z.string(), targetArmyId: z.string() });
export type AttackCommand = z.infer<typeof attackCommandSchema>;
export const moveArmyCommandSchema = z.object({ commandId: z.string().min(8), armyId: z.string(), targetX: z.number().int().min(0).max(mapExtent - 1), targetY: z.number().int().min(0).max(mapExtent - 1) });
export type MoveArmyCommand = z.infer<typeof moveArmyCommandSchema>;
export const recruitCommandSchema = z.object({ commandId: z.string().min(8), cityId: z.string(), unitType: z.enum(unitTypes), amount: z.number().int().min(10).max(50) });
export type RecruitCommand = z.infer<typeof recruitCommandSchema>;
export const setFormationCommandSchema = z.object({ commandId: z.string().min(8), armyId: z.string(), formation: z.enum(formations) });
export type SetFormationCommand = z.infer<typeof setFormationCommandSchema>;
export const mergeArmyCommandSchema = z.object({ commandId: z.string().min(8), sourceArmyId: z.string(), targetArmyId: z.string() });
export type MergeArmyCommand = z.infer<typeof mergeArmyCommandSchema>;
export const cancelArmyOrderCommandSchema = z.object({ commandId: z.string().min(8), armyId: z.string() });
export type CancelArmyOrderCommand = z.infer<typeof cancelArmyOrderCommandSchema>;

// === PHASE 4: ALLIANCE & DIPLOMACY COMMAND SCHEMAS ===
export const createAllianceCommandSchema = z.object({ commandId: z.string().min(8), name: z.string().min(2).max(30), tag: z.string().min(2).max(5) });
export type CreateAllianceCommand = z.infer<typeof createAllianceCommandSchema>;
export const joinAllianceCommandSchema = z.object({ commandId: z.string().min(8), allianceId: z.string() });
export type JoinAllianceCommand = z.infer<typeof joinAllianceCommandSchema>;
export const leaveAllianceCommandSchema = z.object({ commandId: z.string().min(8) });
export type LeaveAllianceCommand = z.infer<typeof leaveAllianceCommandSchema>;
export const contributeAllianceCommandSchema = z.object({ commandId: z.string().min(8), cityId: z.string(), resources: z.object({ wood: z.number().int().nonnegative(), stone: z.number().int().nonnegative(), iron: z.number().int().nonnegative() }) });
export type ContributeAllianceCommand = z.infer<typeof contributeAllianceCommandSchema>;
export const manageAllianceMemberCommandSchema = z.object({ commandId: z.string().min(8), targetPlayerId: z.string(), action: z.enum(["promote", "demote", "kick"]) });
export const setAllianceNoticeCommandSchema = z.object({ commandId: z.string().min(8), notice: z.string().max(200) });
export const openAllianceVoteCommandSchema = z.object({ commandId: z.string().min(8), candidatePlayerId: z.string() });
export const castAllianceVoteCommandSchema = z.object({ commandId: z.string().min(8), voteId: z.string(), vote: z.boolean() });
export const adminCloseSeasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const seasonArchiveSchema = z.object({
  seasons: z.array(z.object({ seasonId: z.string(), closedAt: z.string(), rankings: z.array(z.object({ playerId: z.string(), displayName: z.string(), factionId: z.enum(factionIds), rank: z.number().int(), overall: z.number(), scores: scoreSchema })) })),
  profile: z.object({ crossSeasonReputation: z.number().int(), title: z.string().nullable(), badge: z.string().nullable(), cityGlow: z.boolean(), crown: z.boolean(), legacyRecords: z.array(z.object({ id: z.string(), seasonId: z.string(), recordType: z.string(), payload: z.unknown() })) }),
});
export type SeasonArchive = z.infer<typeof seasonArchiveSchema>;

export const proposeTreatyCommandSchema = z.object({ commandId: z.string().min(8), targetPlayerId: z.string(), treatyType: z.enum(treatyTypes), durationSeconds: z.number().int().positive().optional() });
export type ProposeTreatyCommand = z.infer<typeof proposeTreatyCommandSchema>;
export const respondTreatyCommandSchema = z.object({ commandId: z.string().min(8), treatyId: z.string(), accept: z.boolean() });
export type RespondTreatyCommand = z.infer<typeof respondTreatyCommandSchema>;
export const breakTreatyCommandSchema = z.object({ commandId: z.string().min(8), treatyId: z.string() });
export type BreakTreatyCommand = z.infer<typeof breakTreatyCommandSchema>;export const launchSpyCommandSchema = z.object({ commandId: z.string().min(8), targetPlayerId: z.string(), missionType: z.enum(launchableSpyMissionTypes) });
export type LaunchSpyCommand = z.infer<typeof launchSpyCommandSchema>;
export const counterIntelCommandSchema = z.object({ commandId: z.string().min(8) });
export type CounterIntelCommand = z.infer<typeof counterIntelCommandSchema>;

export type ClientMessage = { type: "BUILD_START"; payload: BuildCommand }
  | { type: "ATTACK"; payload: AttackCommand }
  | { type: "MOVE_ARMY"; payload: MoveArmyCommand }
  | { type: "RECRUIT"; payload: RecruitCommand }
  | { type: "SET_FORMATION"; payload: SetFormationCommand }
  | { type: "MERGE_ARMY"; payload: MergeArmyCommand }
  | { type: "CREATE_ALLIANCE"; payload: CreateAllianceCommand }
  | { type: "JOIN_ALLIANCE"; payload: JoinAllianceCommand }
  | { type: "LEAVE_ALLIANCE"; payload: LeaveAllianceCommand }
  | { type: "CONTRIBUTE_ALLIANCE"; payload: ContributeAllianceCommand }
  | { type: "PROPOSE_TREATY"; payload: ProposeTreatyCommand }
  | { type: "RESPOND_TREATY"; payload: RespondTreatyCommand }
  | { type: "BREAK_TREATY"; payload: BreakTreatyCommand }
  | { type: "LAUNCH_SPY"; payload: LaunchSpyCommand }
  | { type: "COUNTER_INTEL"; payload: CounterIntelCommand };
  
export type ServerMessage = { type: "SNAPSHOT"; payload: WorldSnapshot } 
  | { type: "ERROR"; code: string; message: string } 
  | { type: "EVENT"; event: string; payload: unknown }
  | { type: "BATTLE_REPORT"; payload: BattleReport }
  | { type: "ATTACK_CANCELED"; payload: { armyId: string; targetArmyId: string; reason: "target_destroyed" | "target_frozen" } }
  | { type: "TREATY_UPDATE"; payload: Treaty }
  | { type: "SPY_REPORT"; payload: SpyMission }
  | { type: "WORLD_EVENT"; payload: WorldEvent };

export const seasonWeights = { military: 0.4, economy: 0.35, diplomacy: 0.25 } as const;

export function overallScore(scores: Pick<Scores, "military" | "economy" | "diplomacy">): number {
  return scores.military * seasonWeights.military + scores.economy * seasonWeights.economy + scores.diplomacy * seasonWeights.diplomacy;
}

export function militaryScore(stats: { victories: number; draws: number; tilesControlled: number; successfulDefenses: number }): number {
  const battleScore = Math.min(400, stats.victories * 50 + stats.draws * 10);
  const territoryScore = Math.min(300, stats.tilesControlled * 5);
  const defenseScore = Math.min(300, stats.successfulDefenses * 40);
  return Math.min(1000, battleScore + territoryScore + defenseScore);
}

export function diplomacyScore(stats: {
  reputation: number;
  treatiesHonored: number;
  treatiesViolated: number;
  activeTreaties: number;
  allianceContribution: number;
}): number {
  const reputationScore = Math.min(400, Math.max(0, stats.reputation));
  const treatyScore = Math.min(300, Math.max(0, stats.treatiesHonored * 30 - stats.treatiesViolated * 100));
  const cooperationScore = Math.min(300, stats.activeTreaties * 50 + Math.floor(100 * Math.log(1 + stats.allianceContribution / 100)));
  return Math.min(1000, Math.max(0, reputationScore + treatyScore + cooperationScore));
}

// === PHASE 7B: GAME RULES CATALOG (server authoritative, client for display) ===
export const gameRules = {
  buildings: {
    town_hall: { id: "town_hall", name: "Tòa thị chính", description: "Trung tâm thành phố; nâng cấp mở rộng kho chứa.", cost: { food: 0, wood: 100, stone: 50, iron: 0 }, durationSeconds: 10 },
    warehouse: { id: "warehouse", name: "Nhà kho", description: "Tăng sức chứa nguyên liệu của thành phố.", cost: { food: 0, wood: 80, stone: 25, iron: 0 }, durationSeconds: 8 },
    road_depot: { id: "road_depot", name: "Trạm tiếp tế", description: "Mở tuyến vận tải; tăng hồi phục tiếp tế quân đội gần khu.", cost: { food: 0, wood: 120, stone: 80, iron: 20 }, durationSeconds: 12 },
    barracks: { id: "barracks", name: "Doanh trại", description: "Cho phép tuyển mộ quân đội trong thành phố.", cost: { food: 0, wood: 150, stone: 100, iron: 50 }, durationSeconds: 15 },
  } as const,
  recruitment: {
    infantry: { id: "infantry", name: "Bộ binh", description: "Cân bằng, mạnh chống cung thủ.", cost: { wood: 50, stone: 30, iron: 10 } },
    cavalry: { id: "cavalry", name: "Kỵ binh", description: "Nhanh nhẹn, mạnh chống bộ binh.", cost: { wood: 30, stone: 20, iron: 40 } },
    archer: { id: "archer", name: "Cung thủ", description: "Tầm xa, mạnh chống kỵ binh.", cost: { wood: 40, stone: 10, iron: 20 } },
  } as const,
  army: {
    maxStrengthPerArmy: 500,
    recruitAmountStep: 10, recruitAmountMin: 10, recruitAmountMax: 50,
    formationCost: 0,
  } as const,
  raiders: {
    targetCount: 3,
    respawnDelayMs: 300000,
    actionIntervalMs: 10000,
    strengthMin: 30, strengthMax: 60,
    huntRadius: 3,
    minTilesFromCity: 4,
  } as const,
  market: {
    name: "Thương cảng Meridian",
    anchorX: 10, anchorY: 10,
    minTilesFromCity: 3,
  } as const,
  supply: {
    cycleSeconds: 60,
    insideCityRadius: 2, insideCityPerMinute: 10,
    depotRadiusBase: 3, depotRadiusPerLevel: 1, atDepotPerMinute: 15,
    outsidePerMinute: -5,
    attritionBelowSupply: 25, attritionStrengthPerMinute: 1, attritionMoralePerMinute: 2,
    min: 0, max: 100,
  } as const,
  map: {
    /** Grid is `extent × extent`; valid tiles are `[0..extent-1]` on both axes. */
    extent: mapExtent,
    placementMargin,
    /** RenderTexture resolution the client bakes terrain at (`apps/client/src/map.ts`).
     *  It belongs to the rules because it is half of the arithmetic that caps
     *  `extent`: the bake is a single texture `(56 · extent + 2) · resolution` px
     *  wide, and WebGL only guarantees 4096. At extent 36 that is 4036 px, with 60
     *  to spare; extent 40 would need a chunked renderer.
     *  `map-geometry.test.ts` asserts the ceiling so it stays a test, not luck. */
    textureResolution: 2,
  } as const,
  cityPlacement: {
    minX: placementMargin, maxX: mapExtent - 1 - placementMargin,
    minY: placementMargin, maxY: mapExtent - 1 - placementMargin,
    minDistanceBetweenCities: 3,
    maxDistanceToHubOrNode: 2,
  } as const,
} as const;

export type RecruitUnitId = keyof typeof gameRules.recruitment;

// Recruitment is priced per pack of `recruitAmountStep` troops: cost × (amount / step).
// Single source of truth used by the server to charge and the client to preview.
export function recruitmentCost(unitType: RecruitUnitId, amount: number): { wood: number; stone: number; iron: number } {
  const { cost } = gameRules.recruitment[unitType];
  const multiplier = amount / gameRules.army.recruitAmountStep;
  return { wood: cost.wood * multiplier, stone: cost.stone * multiplier, iron: cost.iron * multiplier };
}


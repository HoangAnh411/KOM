import { z } from "zod";

export const factionIds = ["meridian", "bastion", "ravager", "veiled"] as const;
export type FactionId = (typeof factionIds)[number];

export const factions: Record<FactionId, { name: string; description: string }> = {
  meridian: { name: "Meridian League", description: "Thương mại và caravan hiệu quả." },
  bastion: { name: "Bastion Covenant", description: "Phòng thủ thành phố và hồi phục." },
  ravager: { name: "Ravager Clans", description: "Cơ động và phục kích logistics." },
  veiled: { name: "Veiled Concord", description: "Tình báo và ngoại giao." }
};

export const resourceSchema = z.object({ food: z.number().int().nonnegative(), wood: z.number().int().nonnegative(), stone: z.number().int().nonnegative(), iron: z.number().int().nonnegative() });
export type Resources = z.infer<typeof resourceSchema>;

export const scoreSchema = z.object({ military: z.number().int().min(0).max(1000), economy: z.number().int().min(0).max(1000), diplomacy: z.number().int().min(0).max(1000), overall: z.number().min(0) });
export type Scores = z.infer<typeof scoreSchema>;

export const citySchema = z.object({ id: z.string(), playerId: z.string(), playerName: z.string(), name: z.string(), x: z.number().int(), y: z.number().int(), resources: resourceSchema, buildings: z.record(z.number().int().positive()), queues: z.array(z.object({ id: z.string(), type: z.enum(["build", "research"]), buildingId: z.string(), targetLevel: z.number().int(), completesAt: z.string() })) });
export type City = z.infer<typeof citySchema>;

export const caravanSchema = z.object({ id: z.string(), ownerPlayerId: z.string(), sourceCityId: z.string(), destinationCityId: z.string(), progress: z.number().min(0).max(1), status: z.enum(["moving", "delivered", "ambushed"]), routeId: z.string().optional(), cargo: resourceSchema.optional(), departureAt: z.string().optional(), arrivesAt: z.string().optional(), escortArmyId: z.string().optional(), ambushSeed: z.number().int().nonnegative().optional() });
export type Caravan = z.infer<typeof caravanSchema>;
export const resourceNodeSchema = z.object({ id: z.string(), kingdomId: z.string(), regionId: z.string(), x: z.number().int(), y: z.number().int(), resourceType: z.enum(['wood', 'stone', 'iron']), remaining: z.number().int().nonnegative(), capacity: z.number().int().positive(), recoveryRate: z.number().int().nonnegative() });
export type ResourceNode = z.infer<typeof resourceNodeSchema>;
export const depotSchema = z.object({ cityId: z.string(), level: z.number().int().positive(), capacity: z.number().int().positive() });
export type Depot = z.infer<typeof depotSchema>;
export const tradeRouteSchema = z.object({ id: z.string(), kingdomId: z.string().optional(), ownerPlayerId: z.string(), sourceCityId: z.string(), destinationCityId: z.string(), distance: z.number().int().nonnegative(), travelTimeSeconds: z.number().int().positive(), status: z.enum(['active', 'disabled']) });
export type TradeRoute = z.infer<typeof tradeRouteSchema>;
export const logisticsSnapshotSchema = z.object({ resourceNodes: z.array(resourceNodeSchema), depots: z.array(depotSchema), tradeRoutes: z.array(tradeRouteSchema), throughput: z.record(z.object({ wood: z.number().int().nonnegative(), stone: z.number().int().nonnegative(), iron: z.number().int().nonnegative() })) });
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

export const armySchema = z.object({ 
  id: z.string(), 
  ownerPlayerId: z.string(), 
  x: z.number().int(), 
  y: z.number().int(), 
  unitType: z.enum(unitTypes), 
  strength: z.number().int().min(0).max(500), 
  morale: z.number().int().min(0).max(100), 
  formation: z.enum(formations), 
  supply: z.number().int().min(0).max(100), 
  targetX: z.number().int().optional(), 
  targetY: z.number().int().optional() 
});
export type Army = z.infer<typeof armySchema>;

export const heroSchema = z.object({ id: z.string(), ownerPlayerId: z.string(), name: z.string(), x: z.number().int(), y: z.number().int() });
export type Hero = z.infer<typeof heroSchema>;

export const mapTileSchema = z.object({ x: z.number().int(), y: z.number().int(), terrain: z.enum(terrainTypes) });
export type MapTile = z.infer<typeof mapTileSchema>;

export const battleReportSchema = z.object({
  id: z.string(),
  kingdomId: z.string(),
  seasonId: z.string(),
  tileX: z.number().int(),
  tileY: z.number().int(),
  terrain: z.enum(terrainTypes),
  attacker: z.object({
    playerId: z.string(),
    armyId: z.string(),
    unitType: z.enum(unitTypes),
    formation: z.enum(formations),
    strengthBefore: z.number().int(),
    strengthAfter: z.number().int(),
    moraleBefore: z.number().int(),
    moraleAfter: z.number().int(),
    supplyBefore: z.number().int(),
  }),
  defender: z.object({
    playerId: z.string(),
    armyId: z.string(),
    unitType: z.enum(unitTypes),
    formation: z.enum(formations),
    strengthBefore: z.number().int(),
    strengthAfter: z.number().int(),
    moraleBefore: z.number().int(),
    moraleAfter: z.number().int(),
    supplyBefore: z.number().int(),
  }),
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
  createdAt: z.string(),
});
export type Alliance = z.infer<typeof allianceSchema>;

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

export const snapshotSchema = z.object({ kingdom: z.object({ id: z.string(), name: z.string() }), season: z.object({ id: z.string(), status: z.enum(["SCHEDULED", "ACTIVE", "FINALIZING", "CLOSED"]), endsAt: z.string() }), cities: z.array(citySchema), caravans: z.array(caravanSchema), armies: z.array(armySchema), heroes: z.array(heroSchema), scores: z.record(scoreSchema), factionCatalog: z.record(z.object({ name: z.string(), description: z.string() })), logistics: logisticsSnapshotSchema, battleReports: z.array(battleReportSchema).optional(), terrainMap: z.record(z.enum(terrainTypes)).optional(), alliances: z.array(allianceSchema).optional(), treaties: z.array(treatySchema).optional() });
export type WorldSnapshot = z.infer<typeof snapshotSchema>;

export const buildCommandSchema = z.object({ commandId: z.string().min(8), cityId: z.string(), buildingId: z.enum(["town_hall", "warehouse", "road_depot", "barracks"]), queueType: z.enum(["build", "research"]).default("build") });
export type BuildCommand = z.infer<typeof buildCommandSchema>;
export const harvestCommandSchema = z.object({ commandId: z.string().min(8), nodeId: z.string(), cityId: z.string(), amount: z.number().int().positive().max(50) });
export const routeCommandSchema = z.object({ commandId: z.string().min(8), sourceCityId: z.string(), destinationCityId: z.string() });
export const caravanCommandSchema = z.object({ commandId: z.string().min(8), routeId: z.string(), cargo: z.object({ wood: z.number().int().nonnegative(), stone: z.number().int().nonnegative(), iron: z.number().int().nonnegative() }) });
export const escortCommandSchema = z.object({ commandId: z.string().min(8), caravanId: z.string(), armyId: z.string() });
export const ambushCommandSchema = z.object({ commandId: z.string().min(8), caravanId: z.string(), attackerPlayerId: z.string().optional() });

// === PHASE 3: COMBAT COMMAND SCHEMAS ===
export const attackCommandSchema = z.object({ commandId: z.string().min(8), armyId: z.string(), targetArmyId: z.string() });
export type AttackCommand = z.infer<typeof attackCommandSchema>;
export const moveArmyCommandSchema = z.object({ commandId: z.string().min(8), armyId: z.string(), targetX: z.number().int().min(0).max(19), targetY: z.number().int().min(0).max(19) });
export type MoveArmyCommand = z.infer<typeof moveArmyCommandSchema>;
export const recruitCommandSchema = z.object({ commandId: z.string().min(8), cityId: z.string(), unitType: z.enum(unitTypes), amount: z.number().int().min(10).max(50) });
export type RecruitCommand = z.infer<typeof recruitCommandSchema>;
export const setFormationCommandSchema = z.object({ commandId: z.string().min(8), armyId: z.string(), formation: z.enum(formations) });
export type SetFormationCommand = z.infer<typeof setFormationCommandSchema>;
export const mergeArmyCommandSchema = z.object({ commandId: z.string().min(8), sourceArmyId: z.string(), targetArmyId: z.string() });
export type MergeArmyCommand = z.infer<typeof mergeArmyCommandSchema>;

// === PHASE 4: ALLIANCE & DIPLOMACY COMMAND SCHEMAS ===
export const createAllianceCommandSchema = z.object({ commandId: z.string().min(8), name: z.string().min(2).max(30), tag: z.string().min(2).max(5) });
export type CreateAllianceCommand = z.infer<typeof createAllianceCommandSchema>;
export const joinAllianceCommandSchema = z.object({ commandId: z.string().min(8), allianceId: z.string() });
export type JoinAllianceCommand = z.infer<typeof joinAllianceCommandSchema>;
export const leaveAllianceCommandSchema = z.object({ commandId: z.string().min(8) });
export type LeaveAllianceCommand = z.infer<typeof leaveAllianceCommandSchema>;
export const contributeAllianceCommandSchema = z.object({ commandId: z.string().min(8), cityId: z.string(), resources: z.object({ wood: z.number().int().nonnegative(), stone: z.number().int().nonnegative(), iron: z.number().int().nonnegative() }) });
export type ContributeAllianceCommand = z.infer<typeof contributeAllianceCommandSchema>;

export const proposeTreatyCommandSchema = z.object({ commandId: z.string().min(8), targetPlayerId: z.string(), treatyType: z.enum(treatyTypes), durationSeconds: z.number().int().positive().optional() });
export type ProposeTreatyCommand = z.infer<typeof proposeTreatyCommandSchema>;
export const respondTreatyCommandSchema = z.object({ commandId: z.string().min(8), treatyId: z.string(), accept: z.boolean() });
export type RespondTreatyCommand = z.infer<typeof respondTreatyCommandSchema>;
export const breakTreatyCommandSchema = z.object({ commandId: z.string().min(8), treatyId: z.string() });
export type BreakTreatyCommand = z.infer<typeof breakTreatyCommandSchema>;

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
  | { type: "BREAK_TREATY"; payload: BreakTreatyCommand };
  
export type ServerMessage = { type: "SNAPSHOT"; payload: WorldSnapshot } 
  | { type: "ERROR"; code: string; message: string } 
  | { type: "EVENT"; event: string; payload: unknown }
  | { type: "BATTLE_REPORT"; payload: BattleReport }
  | { type: "TREATY_UPDATE"; payload: Treaty };

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


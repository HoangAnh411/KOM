import { z } from "zod";
import { worldExtent, worldTerrainTypes } from "./world-map.js";

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
//
// And the number is not even written here: it is how many rows the authored map in
// `world-map.ts` has. Resizing the world means authoring a different world, which
// removes the last way for the size and the map to disagree.
const mapExtent = worldExtent;

// Tiles kept clear of the world edge. A city needs room for its
// `minDistanceBetweenCities` ring and a world event for its five-tile cross, so
// both windows inset by this much instead of each carrying its own bounds.
const placementMargin = 2;

export const resourceSchema = z.object({ food: z.number().int().nonnegative(), wood: z.number().int().nonnegative(), stone: z.number().int().nonnegative(), iron: z.number().int().nonnegative() });
export type Resources = z.infer<typeof resourceSchema>;

export const buildingIds = ["town_hall", "warehouse", "road_depot", "barracks", "farm", "lumber_mill", "stone_quarry", "academy", "hospital"] as const;
export type BuildingId = (typeof buildingIds)[number];

export const cityRotations = [0, 90, 180, 270] as const;
export type CityRotation = (typeof cityRotations)[number];
export const cityRotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

export const buildingPlacementSchema = z.object({
  buildingId: z.enum(buildingIds),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  rotation: cityRotationSchema.default(0),
});
export type BuildingPlacement = z.infer<typeof buildingPlacementSchema>;

export const scoreSchema = z.object({ military: z.number().int().min(0).max(1000), economy: z.number().int().min(0).max(1000), diplomacy: z.number().int().min(0).max(1000), overall: z.number().min(0) });
export type Scores = z.infer<typeof scoreSchema>;

export const cityQueueItemSchema = z.object({
  id: z.string(),
  type: z.enum(["build", "research"]),
  buildingId: z.string(),
  targetLevel: z.number().int(),
  completesAt: z.string(),
  startedAt: z.string().optional(),
  plotX: z.number().int().nonnegative().optional(),
  plotY: z.number().int().nonnegative().optional(),
  plotRotation: cityRotationSchema.optional(),
});
export type CityQueueItem = z.infer<typeof cityQueueItemSchema>;

export const citySchema = z.object({
  id: z.string(),
  playerId: z.string(),
  playerName: z.string(),
  name: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  resources: resourceSchema,
  buildings: z.record(z.number().int().positive()),
  cityLayoutVersion: z.literal(2).default(2),
  cityLayoutRevision: z.number().int().nonnegative().default(0),
  buildingPlots: z.array(buildingPlacementSchema).default([]),
  queues: z.array(cityQueueItemSchema),
  productionAt: z.string().optional(),
  frozen: z.boolean().optional(),
  frozenAt: z.string().optional(),
  factionId: z.enum(factionIds).optional(),
  visibility: z.enum(["own", "unknown", "scouted"]).optional(),
  intel: z.object({
    observedAt: z.string(),
    accuracy: z.number().min(0).max(1),
    resources: resourceSchema.optional(),
    buildings: z.record(z.number().int().nonnegative()).optional(),
    armies: z.array(z.object({
      id: z.string(), x: z.number(), y: z.number(), strength: z.number().nonnegative(),
    })).optional(),
  }).optional(),
});
export type City = z.infer<typeof citySchema>;
export type CityVisibility = NonNullable<City["visibility"]>;
export type CityIntel = NonNullable<City["intel"]>;

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

/** Re-exported, not restated: the authored map spells its tiles with these four names, and
 *  a fifth terrain in the grid that the schema rejected would be a map the client draws and
 *  the server refuses to send. One list, in the file that owns the map. */
export const terrainTypes = worldTerrainTypes;
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

// === COMMANDER / MIXED ARMY TYPES ===
// These types are additive so old saves and reports can continue to use the
// legacy single-unit army fields while the new army flow is introduced.
export const commanderSpecialties = ["infantry", "archer", "cavalry", "logistics"] as const;
export type CommanderSpecialty = (typeof commanderSpecialties)[number];

export const commanderSchema = z.object({
  id: z.string(),
  ownerPlayerId: z.string(),
  name: z.string(),
  specialty: z.enum(commanderSpecialties),
  level: z.number().int().min(1).max(10),
  xp: z.number().int().nonnegative(),
  assignedArmyId: z.string().nullable().optional(),
  neutral: z.boolean().optional(),
});
export type Commander = z.infer<typeof commanderSchema>;

export const initialCommanderCatalog: ReadonlyArray<Pick<Commander, "id" | "name" | "specialty">> = [
  { id: "commander-logistics", name: "Mara the Quartermaster", specialty: "logistics" },
  { id: "commander-infantry", name: "Darius the Shield", specialty: "infantry" },
  { id: "commander-archer", name: "Elena Hawkeye", specialty: "archer" },
  { id: "commander-cavalry", name: "Rovan Swiftmane", specialty: "cavalry" },
];
export const commanderUnlockChapter: Readonly<Record<CommanderSpecialty, number>> = {
  logistics: 0,
  infantry: 1,
  archer: 2,
  cavalry: 3,
};

export const troopTypes = ["shield_infantry", "spearmen", "archers", "cavalry"] as const;
export type TroopType = (typeof troopTypes)[number];
export const armyPositions = ["frontline", "backline", "flank"] as const;
export type ArmyPosition = (typeof armyPositions)[number];
export const battleStances = ["balanced", "raid", "defensive"] as const;
export type BattleStance = (typeof battleStances)[number];

export const troopCountsSchema = z.object({
  shield_infantry: z.number().int().nonnegative().default(0),
  spearmen: z.number().int().nonnegative().default(0),
  archers: z.number().int().nonnegative().default(0),
  cavalry: z.number().int().nonnegative().default(0),
});
export type TroopCounts = z.infer<typeof troopCountsSchema>;

export const armySquadSchema = z.object({
  id: z.string(),
  troopType: z.enum(troopTypes),
  position: z.enum(armyPositions),
  count: z.number().int().positive(),
});
export type ArmySquad = z.infer<typeof armySquadSchema>;

export const armyCompositionSchema = z.object({
  frontline: armySquadSchema.nullable(),
  backline: armySquadSchema.nullable(),
  flank: armySquadSchema.nullable(),
}).superRefine((composition, ctx) => {
  for (const position of armyPositions) {
    const squad = composition[position];
    if (squad && squad.position !== position) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [position, "position"], message: "SQUAD_POSITION_MISMATCH" });
    }
  }
});
export type ArmyComposition = z.infer<typeof armyCompositionSchema>;

export const formationPresetSchema = z.object({
  id: z.string(),
  ownerPlayerId: z.string(),
  name: z.string().min(1).max(40),
  composition: armyCompositionSchema,
  stance: z.enum(battleStances),
});
export type FormationPreset = z.infer<typeof formationPresetSchema>;

export const troopReserveSchema = z.object({
  cityId: z.string(),
  ownerPlayerId: z.string(),
  available: troopCountsSchema,
  wounded: troopCountsSchema,
});
export type TroopReserve = z.infer<typeof troopReserveSchema>;

export const trainingQueueItemSchema = z.object({
  id: z.string(),
  cityId: z.string(),
  troopType: z.enum(troopTypes),
  amount: z.number().int().positive(),
  startedAt: z.string(),
  completesAt: z.string(),
});
export type TrainingQueueItem = z.infer<typeof trainingQueueItemSchema>;
export const trainingQueueSchema = z.object({ cityId: z.string(), items: z.array(trainingQueueItemSchema) });
export type TrainingQueue = z.infer<typeof trainingQueueSchema>;

export const hospitalQueueItemSchema = z.object({
  id: z.string(),
  cityId: z.string(),
  troopType: z.enum(troopTypes),
  amount: z.number().int().positive(),
  startedAt: z.string(),
  completesAt: z.string(),
  foodCost: z.number().int().nonnegative(),
});
export type HospitalQueueItem = z.infer<typeof hospitalQueueItemSchema>;
export const hospitalQueueSchema = z.object({ cityId: z.string(), items: z.array(hospitalQueueItemSchema) });
export type HospitalQueue = z.infer<typeof hospitalQueueSchema>;

export const technologyBranches = ["production", "transport", "military_logistics"] as const;
export type TechnologyBranch = (typeof technologyBranches)[number];
export const technologyIds = ["crop_rotation", "sawmill_blades", "road_engineering", "relay_stations", "field_medicine", "quartermaster_drills"] as const;
export type TechnologyId = (typeof technologyIds)[number];
export const technologyCatalog: Readonly<Record<TechnologyId, { id: TechnologyId; branch: TechnologyBranch; name: string; description: string; prerequisite?: TechnologyId; durationSeconds: number }>> = {
  crop_rotation: { id: "crop_rotation", branch: "production", name: "Luân canh", description: "Tăng sản lượng nông trại.", durationSeconds: 20 },
  sawmill_blades: { id: "sawmill_blades", branch: "production", name: "Lưỡi cưa", description: "Tăng sản lượng xưởng gỗ và mỏ đá.", prerequisite: "crop_rotation", durationSeconds: 35 },
  road_engineering: { id: "road_engineering", branch: "transport", name: "Kỹ thuật đường", description: "Giảm thời gian hành quân.", durationSeconds: 20 },
  relay_stations: { id: "relay_stations", branch: "transport", name: "Trạm chuyển tiếp", description: "Tăng bán kính phục hồi tiếp tế.", prerequisite: "road_engineering", durationSeconds: 35 },
  field_medicine: { id: "field_medicine", branch: "military_logistics", name: "Quân y dã chiến", description: "Giảm thời gian chữa thương.", durationSeconds: 20 },
  quartermaster_drills: { id: "quartermaster_drills", branch: "military_logistics", name: "Huấn luyện hậu cần", description: "Giảm tiêu hao tiếp tế.", prerequisite: "field_medicine", durationSeconds: 35 },
};
export const technologyProgressSchema = z.object({ playerId: z.string(), unlocked: z.array(z.enum(technologyIds)) });
export type TechnologyProgress = z.infer<typeof technologyProgressSchema>;
export const researchQueueItemSchema = z.object({ id: z.string(), playerId: z.string(), technologyId: z.enum(technologyIds), startedAt: z.string(), completesAt: z.string() });
export type ResearchQueueItem = z.infer<typeof researchQueueItemSchema>;
export const researchQueueSchema = z.object({ playerId: z.string(), items: z.array(researchQueueItemSchema) });
export type ResearchQueue = z.infer<typeof researchQueueSchema>;

export const campaignMissionKinds = ["combat", "scout", "build", "trade"] as const;
export type CampaignMissionKind = (typeof campaignMissionKinds)[number];
export const campaignRewardSchema = z.object({ wood: z.number().int().nonnegative(), stone: z.number().int().nonnegative(), iron: z.number().int().nonnegative() });
export type CampaignReward = z.infer<typeof campaignRewardSchema>;
export const campaignConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("scout") }),
  z.object({ type: z.literal("build"), buildingId: z.enum(buildingIds), level: z.number().int().positive() }),
  z.object({ type: z.literal("trade"), amount: z.number().int().positive() }),
]);
export type CampaignCondition = z.infer<typeof campaignConditionSchema>;
export const campaignMissionSchema = z.object({ id: z.string(), chapter: z.number().int().min(1).max(3), title: z.string(), description: z.string(), lesson: z.string(), terrain: z.enum(terrainTypes), rewardXp: z.number().int().positive(), kind: z.enum(campaignMissionKinds), target: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }), condition: campaignConditionSchema.optional(), rewardResources: campaignRewardSchema.optional() });
export type CampaignMission = z.infer<typeof campaignMissionSchema>;
export const campaignProgressSchema = z.object({ playerId: z.string(), completedMissionIds: z.array(z.string()), claimedFirstClearIds: z.array(z.string()), unlockedChapter: z.number().int().min(1).max(3) });
export type CampaignProgress = z.infer<typeof campaignProgressSchema>;
export const campaignMissions: ReadonlyArray<CampaignMission> = [
  { id: "chapter-1-ruins", chapter: 1, title: "Phế tích đầu tiên", description: "Hành quân tới phế tích mỏ sắt phía bắc và quét sạch.", lesson: "Giữ tiền tuyến để bảo vệ cung thủ.", terrain: "plains", rewardXp: 25, kind: "combat", target: { x: 117, y: 51 } },
  { id: "chapter-1-raiders", chapter: 1, title: "Trại cướp ven đường", description: "Đối đầu một đội quân hỗn hợp trên tuyến đường tây.", lesson: "Giáo binh làm chậm kỵ binh.", terrain: "hills", rewardXp: 30, kind: "combat", target: { x: 44, y: 117 } },
  { id: "chapter-1-scout", chapter: 1, title: "Dấu chân trong rừng", description: "Đưa quân chạm tới rừng sâu Bắc Lâm để mở vùng chưa trinh sát.", lesson: "Dữ liệu chưa trinh sát là chưa biết.", terrain: "forest", rewardXp: 30, kind: "scout", target: { x: 44, y: 58 }, condition: { type: "scout" }, rewardResources: { wood: 80, stone: 40, iron: 10 } },
  { id: "chapter-1-chief", chapter: 1, title: "Thủ lĩnh cướp", description: "Đánh trận đầu có chủ đích ngay rìa vùng trung tâm.", lesson: "Chọn thế trận theo địa hình.", terrain: "plains", rewardXp: 40, kind: "combat", target: { x: 109, y: 73 } },
  { id: "chapter-2-road", chapter: 2, title: "Mở đường", description: "Mở tuyến xuống cảng Nam Giang: dựng Trạm tiếp tế tại thành của bạn.", lesson: "Tiếp tế quyết định sức bền.", terrain: "hills", rewardXp: 40, kind: "build", target: { x: 73, y: 182 }, condition: { type: "build", buildingId: "road_depot", level: 1 }, rewardResources: { wood: 150, stone: 100, iron: 30 } },
  { id: "chapter-2-marsh", chapter: 2, title: "Đầm lầy phía nam", description: "Đánh trong địa hình bất lợi cho kỵ binh.", lesson: "Đừng dùng kỵ binh mù quáng trong đầm.", terrain: "swamp", rewardXp: 45, kind: "combat", target: { x: 51, y: 138 } },
  { id: "chapter-2-escort", chapter: 2, title: "Hộ tống đoàn xe", description: "Vận chuyển tài nguyên về thương cảng Meridian qua các tuyến caravan.", lesson: "Phối hợp ba vị trí thay vì dồn một loại quân.", terrain: "forest", rewardXp: 45, kind: "trade", target: { x: 73, y: 73 }, condition: { type: "trade", amount: 100 }, rewardResources: { wood: 120, stone: 80, iron: 20 } },
  { id: "chapter-2-fort", chapter: 2, title: "Cổng đá", description: "Phá tuyến phòng thủ trên đường đông.", lesson: "Cung thủ cần tiền tuyến còn sống.", terrain: "hills", rewardXp: 50, kind: "combat", target: { x: 153, y: 73 } },
  { id: "chapter-3-camp", chapter: 3, title: "Bình định trại bắc", description: "Tấn công có trinh sát đầy đủ.", lesson: "Báo cáo phải giải thích nguyên nhân thắng thua.", terrain: "plains", rewardXp: 50, kind: "combat", target: { x: 233, y: 22 } },
  { id: "chapter-3-forest", chapter: 3, title: "Kẻ mai phục", description: "Đánh vòng qua rừng.", lesson: "Giáo binh có thể chặn cánh kỵ binh.", terrain: "forest", rewardXp: 55, kind: "combat", target: { x: 211, y: 211 } },
  { id: "chapter-3-swamp-chief", chapter: 3, title: "Thủ lĩnh đầm lầy", description: "Kết hợp cung và bộ binh.", lesson: "Thế phòng thủ giúp giữ quân.", terrain: "swamp", rewardXp: 60, kind: "combat", target: { x: 22, y: 233 } },
  { id: "chapter-3-meridian", chapter: 3, title: "Bình định Meridian", description: "Hoàn tất chiến dịch đầu mùa ngay tâm thế giới.", lesson: "Không có lực chiến cam kết; hãy đọc từng hiệp.", terrain: "plains", rewardXp: 75, kind: "combat", target: { x: 127, y: 127 } },
];

export const commanderCapacity = (level: number): number => Math.min(500, 100 + 50 * (Math.max(1, Math.min(10, Math.floor(level))) - 1));
export const armyCompositionTotal = (composition: ArmyComposition): number => armyPositions.reduce((total, position) => total + (composition[position]?.count ?? 0), 0);
export const emptyTroopCounts = (): TroopCounts => ({ shield_infantry: 0, spearmen: 0, archers: 0, cavalry: 0 });

export const armyV2FieldsSchema = z.object({
  commanderId: z.string(),
  composition: armyCompositionSchema,
  stance: z.enum(battleStances),
  wounded: troopCountsSchema.default(emptyTroopCounts()),
});

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
  // New armies use these fields; the legacy fields above remain during save migration.
  commanderId: z.string().optional(),
  composition: armyCompositionSchema.optional(),
  stance: z.enum(battleStances).optional(),
  wounded: troopCountsSchema.optional(),
  homeCityId: z.string().optional(),
  recoveryAt: z.string().optional(),
  returningHome: z.boolean().optional(),
  frozen: z.boolean().optional(),
  frozenAt: z.string().optional()
});
export type Army = z.infer<typeof armySchema>;
export const armyTotal = (army: Pick<Army, "strength" | "composition">): number => army.composition ? armyCompositionTotal(army.composition) : army.strength;

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

const mixedBattleGroupResultSchema = z.object({
  squadId: z.string(),
  troopType: z.enum(troopTypes),
  position: z.enum(armyPositions),
  countBefore: z.number().int().nonnegative(),
  countAfter: z.number().int().nonnegative(),
  casualties: z.number().int().nonnegative(),
});
const mixedBattleActionSchema = z.object({
  sourceSquadId: z.string(),
  targetSquadId: z.string(),
  skill: z.string().optional(),
});
const mixedBattleSideReportSchema = z.object({
  commanderId: z.string(),
  commanderSpecialty: z.enum(commanderSpecialties),
  commanderLevel: z.number().int().min(1).max(10),
  stance: z.enum(battleStances),
  composition: armyCompositionSchema,
  totalBefore: z.number().int().nonnegative(),
  totalAfter: z.number().int().nonnegative(),
  killed: z.number().int().nonnegative(),
  wounded: z.number().int().nonnegative(),
});
export const mixedBattleReportSchema = z.object({
  rulesVersion: z.literal(1),
  attacker: mixedBattleSideReportSchema,
  defender: mixedBattleSideReportSchema,
  rounds: z.array(z.object({
    round: z.number().int(),
    attacker: z.array(mixedBattleGroupResultSchema),
    defender: z.array(mixedBattleGroupResultSchema),
    actions: z.array(mixedBattleActionSchema).optional(),
    explanations: z.array(z.string()),
  })),
});
export type MixedBattleReport = z.infer<typeof mixedBattleReportSchema>;

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
  mixed: mixedBattleReportSchema.optional(),
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

// === PLAYER HUB / COSMETICS ===
// Cosmetic ownership is deliberately separate from resources and combat state.
// The server still validates every price and entitlement; these definitions only
// make the catalog and the hub response stable for clients.
export const cosmeticSlots = ["avatar_frame", "flag_color", "nameplate"] as const;
export type CosmeticSlot = (typeof cosmeticSlots)[number];

export const cosmeticCatalogItemSchema = z.object({
  id: z.string(),
  slot: z.enum(cosmeticSlots),
  name: z.string(),
  description: z.string(),
  price: z.number().int().positive(),
  preview: z.string(),
});
export type CosmeticCatalogItem = z.infer<typeof cosmeticCatalogItemSchema>;

export const cosmeticWalletSchema = z.object({ badges: z.number().int().nonnegative() });
export type CosmeticWallet = z.infer<typeof cosmeticWalletSchema>;

export const ownedCosmeticSchema = z.object({ itemId: z.string(), acquiredAt: z.string() });
export type OwnedCosmetic = z.infer<typeof ownedCosmeticSchema>;

export const equippedCosmeticsSchema = z.object({
  avatar_frame: z.string().nullable(),
  flag_color: z.string().nullable(),
  nameplate: z.string().nullable(),
});
export type EquippedCosmetics = z.infer<typeof equippedCosmeticsSchema>;

export const claimableCosmeticRewardSchema = z.object({
  id: z.string(),
  title: z.string(),
  amount: z.number().int().positive(),
  eligible: z.boolean(),
  claimed: z.boolean(),
});
export type ClaimableCosmeticReward = z.infer<typeof claimableCosmeticRewardSchema>;

export const playerHubSchema = z.object({
  catalogVersion: z.string(),
  currencyLabel: z.literal("Huy hieu"),
  catalog: z.array(cosmeticCatalogItemSchema),
  wallet: cosmeticWalletSchema,
  owned: z.array(ownedCosmeticSchema),
  equipped: equippedCosmeticsSchema,
  rewards: z.array(claimableCosmeticRewardSchema),
  profile: z.object({
    displayName: z.string(),
    factionId: z.enum(factionIds),
    scores: scoreSchema,
    crossSeasonReputation: z.number().int(),
    title: z.string().nullable(),
  }),
});
export type PlayerHub = z.infer<typeof playerHubSchema>;

export const cosmeticClaimCommandSchema = z.object({ commandId: z.string().min(8), rewardId: z.string() });
export type CosmeticClaimCommand = z.infer<typeof cosmeticClaimCommandSchema>;
export const cosmeticPurchaseCommandSchema = z.object({ commandId: z.string().min(8), itemId: z.string() });
export type CosmeticPurchaseCommand = z.infer<typeof cosmeticPurchaseCommandSchema>;
export const cosmeticEquipCommandSchema = z.object({
  commandId: z.string().min(8),
  slot: z.enum(cosmeticSlots),
  itemId: z.string().nullable(),
});
export type CosmeticEquipCommand = z.infer<typeof cosmeticEquipCommandSchema>;

export const cosmeticCatalog: CosmeticCatalogItem[] = [
  { id: "frame_meridian", slot: "avatar_frame", name: "Khung Meridian", description: "Khung cơ bản của liên minh Meridian.", price: 75, preview: "frame-meridian" },
  { id: "frame_sentinel", slot: "avatar_frame", name: "Khung Sentinel", description: "Khung đá dành cho người canh giới.", price: 75, preview: "frame-sentinel" },
  { id: "flag_sea", slot: "flag_color", name: "Cờ Hải Lam", description: "Màu cờ xanh biển của Meridian.", price: 100, preview: "flag-sea" },
  { id: "flag_ember", slot: "flag_color", name: "Cờ Ember", description: "Màu cờ đỏ ấm cho đạo quân tiên phong.", price: 100, preview: "flag-ember" },
  { id: "nameplate_brass", slot: "nameplate", name: "Bảng tên Brass", description: "Bảng tên kim loại sáng.", price: 125, preview: "nameplate-brass" },
  { id: "nameplate_slate", slot: "nameplate", name: "Bảng tên Slate", description: "Bảng tên đá xanh trầm.", price: 125, preview: "nameplate-slate" },
];

export const cosmeticRewards: Array<{ id: string; title: string; amount: number; step?: OnboardingStep }> = [
  { id: "welcome", title: "Phần thưởng chào mừng", amount: 100 },
  { id: "onboarding_depot", title: "Xây trạm tiếp tế", amount: 100, step: "depot_built" },
  { id: "onboarding_barracks", title: "Xây doanh trại", amount: 100, step: "barracks_built" },
  { id: "onboarding_recruit", title: "Tuyển quân", amount: 100, step: "army_recruited" },
  { id: "onboarding_harvest", title: "Thu hoạch", amount: 100, step: "resource_harvested" },
  { id: "onboarding_export", title: "Xuất hàng", amount: 100, step: "market_exported" },
  { id: "onboarding_raider", title: "Thắng raider", amount: 100, step: "raider_defeated" },
];

// === DAILY QUESTS ===
// Six quests a day, every player in the world the same six: three easy (1 point
// each, drawn from a pool of four), both medium (2 points) and the one hard
// (3 points) — 10 points total. Points come from *completing* quests; claiming
// the reward is a separate act, and unclaimed rewards are forfeit when the day
// rolls at 00:00 UTC. The client joins quest ids against this catalog the way
// it joins campaign missions — authored data does not ride the wire.
//
// Progress is not stored: the server derives it as `max(0, current − baseline)`
// from monotonic counters against per-player baselines captured at the day roll
// (`apps/server/src/daily-quests.ts`). The metrics below name those counters.
export const dailyQuestMetrics = ["harvests", "builds_completed", "training_batches", "caravans_delivered", "battles_won", "campaigns_completed", "spy_successes"] as const;
export type DailyQuestMetric = (typeof dailyQuestMetrics)[number];
export const dailyQuestDifficulties = ["easy", "medium", "hard"] as const;

export const dailyQuestSchema = z.object({
  id: z.string(),
  difficulty: z.enum(dailyQuestDifficulties),
  points: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  metric: z.enum(dailyQuestMetrics),
  target: z.number().int().positive(),
  reward: z.object({ wood: z.number().int().nonnegative(), stone: z.number().int().nonnegative(), iron: z.number().int().nonnegative() }),
  title: z.string(),
  description: z.string(),
});
export type DailyQuest = z.infer<typeof dailyQuestSchema>;

export const dailyQuests: ReadonlyArray<DailyQuest> = [
  // Easy pool — `selectDailyQuestIds` draws three of these four per day.
  { id: "daily_harvest", difficulty: "easy", points: 1, metric: "harvests", target: 3, reward: { wood: 60, stone: 40, iron: 15 }, title: "Vào rừng lấy gỗ", description: "Khai thác tài nguyên 3 lần trong ngày." },
  { id: "daily_build", difficulty: "easy", points: 1, metric: "builds_completed", target: 2, reward: { wood: 60, stone: 40, iron: 15 }, title: "Chuẩn bị xây dựng", description: "Hoàn tất 2 cấp công trình trong ngày." },
  { id: "daily_train", difficulty: "easy", points: 1, metric: "training_batches", target: 2, reward: { wood: 60, stone: 40, iron: 15 }, title: "Ra quân thao trường", description: "Huấn luyện 2 mẻ quân trong ngày." },
  { id: "daily_caravan", difficulty: "easy", points: 1, metric: "caravans_delivered", target: 2, reward: { wood: 60, stone: 40, iron: 15 }, title: "Người của thương lộ", description: "Đưa 2 caravan tới đích trong ngày." },
  // Medium — both every day.
  { id: "daily_battle", difficulty: "medium", points: 2, metric: "battles_won", target: 1, reward: { wood: 120, stone: 80, iron: 30 }, title: "Trận đánh đầu ngày", description: "Thắng 1 trận đánh bất kỳ trong ngày." },
  { id: "daily_campaign", difficulty: "medium", points: 2, metric: "campaigns_completed", target: 1, reward: { wood: 120, stone: 80, iron: 30 }, title: "Mệnh lệnh từ chỉ huy", description: "Hoàn tất 1 nhiệm vụ chiến dịch hoặc thắng 1 lượt tuần tra trong ngày." },
  // Hard — the one every day. Deliberately not "explore N tiles": the
  // exploration mask saturates mid-season (reveal radius 14), which would kill
  // a 3-point quest for established players.
  { id: "daily_spy", difficulty: "hard", points: 3, metric: "spy_successes", target: 1, reward: { wood: 200, stone: 140, iron: 50 }, title: "Mắt trong bóng tối", description: "Thành công 1 điệp vụ tình báo trong ngày." },
];

// Claim both at 5 points (halfway) and at 10 (full board). Full clear pays
// ~1170 wood across the day — about three patrol wins, meaningful but below
// what active play already produces.
export const dailyQuestMilestones: ReadonlyArray<{ points: number; reward: { wood: number; stone: number; iron: number } }> = [
  { points: 5, reward: { wood: 150, stone: 100, iron: 40 } },
  { points: 10, reward: { wood: 400, stone: 280, iron: 100 } },
];

// UTC day a timestamp falls in, as `YYYY-MM-DD` — the authoritative day key.
export function dailyQuestDayKey(now: Date | number): string {
  return new Date(now).toISOString().slice(0, 10);
}

// The ISO instant the current day rolls over: next 00:00 UTC.
export function dailyQuestRefreshesAt(now: Date | number): string {
  const date = new Date(now);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString();
}

// FNV-1a → mulberry32: a small deterministic PRNG chain that runs identically
// in Node and the browser (only `Math.imul` and `>>>`).
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The six quest ids for a UTC day: three of the four easy (deterministic per
 *  day — no re-roll mid-day, everyone in the world the same), both medium, the hard. */
export function selectDailyQuestIds(dayKey: string): string[] {
  const hash = [...`daily-quests:${dayKey}`].reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5);
  const random = mulberry32(hash);
  const easy = dailyQuests.filter(quest => quest.difficulty === "easy").map(quest => quest.id);
  for (let i = easy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [easy[i], easy[j]] = [easy[j], easy[i]];
  }
  return [...easy.slice(0, 3), ...dailyQuests.filter(quest => quest.difficulty !== "easy").map(quest => quest.id)];
}

export const dailyQuestClaimCommandSchema = z.object({
  commandId: z.string().min(8),
  questId: z.string().optional(),
  milestone: z.union([z.literal(5), z.literal(10)]).optional(),
}).refine(value => (value.questId !== undefined) !== (value.milestone !== undefined), { message: "EXACTLY_ONE_TARGET" });
export type DailyQuestClaimCommand = z.infer<typeof dailyQuestClaimCommandSchema>;

// Viewer-scoped, derived on read — no stored progress travels, only today's
// ids, progress against target, claim state and the milestones already taken.
export const dailyQuestSnapshotSchema = z.object({
  dayKey: z.string(),
  refreshesAt: z.string(),
  points: z.number().int().min(0),
  quests: z.array(z.object({ questId: z.string(), progress: z.number().int().min(0), claimed: z.boolean() })),
  claimedMilestones: z.array(z.number().int()),
});
export type DailyQuestSnapshot = z.infer<typeof dailyQuestSnapshotSchema>;

// Protocol version of the world snapshot contract. Clients lock game commands
// and ask for a refresh when the server speaks a different version.
//
// Bumped to 2 when the terrain grid left the wire. The snapshot used to carry a
// tile-by-tile `terrainMap`; the world is now authored in `world-map.ts`, which
// both sides import, and the snapshot carries only `terrainOverrides` (tiles that
// differ from it) plus `worldMapDigest` to name which world that is. Both fields
// are optional, and a missing tile defaults to plains, so *without* this bump the
// mismatch would be silent in both directions: a v1 client against a v2 server
// paints the whole world plains, and a v2 client against a v1 server draws the
// authored map while the server adjudicates battles on the old modulo terrain.
// Silence is the failure mode the version gate exists to convert into a message.
//
// `regionControl` joined the same bump rather than earning a third version: v2 has not
// shipped yet, and a client that cannot read territory would draw an unheld world — quiet
// in exactly the way this comment is about.
export const PROTOCOL_VERSION = 4;
export const battleHistoryResponseSchema = z.object({ items: z.array(battleReportSchema), nextCursor: z.string().optional() });
export type BattleHistoryResponse = z.infer<typeof battleHistoryResponseSchema>;

// Who holds the sixteen provinces: province code → controller player id, held ones only.
// Deliberately *only* the controller. A province's name, seat and tile count are authored in
// `world-map.ts`, which the client imports, so putting them on the wire every tick would be
// the same mistake `terrainMap` was — sixteen rows of never-changing text at 1000ms. An
// absent code reads as unheld, which is also the state at season start, so `{}` is honest
// rather than a gap. Optional for the same reason every field added since v1 is: a snapshot
// replayed from an older ledger row has no opinion about territory.
export const regionControlSchema = z.record(z.string());

export const worldDescriptorSchema = z.object({
  id: z.string(),
  extent: z.number().int().positive(),
  chunkSize: z.number().int().positive(),
  digest: z.string(),
  assetManifestUrl: z.string(),
});
export type WorldDescriptor = z.infer<typeof worldDescriptorSchema>;

export const explorationSchema = z.object({
  resolution: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  encodedMask: z.string(),
});
export type Exploration = z.infer<typeof explorationSchema>;

export const snapshotSchema = z.object({ protocolVersion: z.number().int().default(PROTOCOL_VERSION), kingdom: z.object({ id: z.string(), name: z.string() }), season: z.object({ id: z.string(), status: z.enum(["SCHEDULED", "ACTIVE", "FINALIZING", "CLOSED"]), endsAt: z.string() }), world: worldDescriptorSchema, exploration: explorationSchema, cities: z.array(citySchema), caravans: z.array(caravanSchema), armies: z.array(armySchema), heroes: z.array(heroSchema), scores: z.record(scoreSchema), factionCatalog: z.record(z.object({ name: z.string(), description: z.string() })), commanderCatalog: z.array(z.object({ id: z.string(), name: z.string(), specialty: z.enum(commanderSpecialties) })).optional(), logistics: logisticsSnapshotSchema, commanders: z.array(commanderSchema).optional(), troopReserves: z.record(troopReserveSchema).optional(), formationPresets: z.array(formationPresetSchema).optional(), trainingQueues: z.record(trainingQueueSchema).optional(), hospitalQueues: z.record(hospitalQueueSchema).optional(), technologyProgress: z.record(technologyProgressSchema).optional(), researchQueues: z.record(researchQueueSchema).optional(), campaignProgress: z.record(campaignProgressSchema).optional(), battleReports: z.array(battleReportSchema).optional(), worldMapDigest: z.string().optional(), terrainOverrides: z.record(z.enum(terrainTypes)).optional(), regionControl: regionControlSchema.optional(), alliances: z.array(allianceSchema).optional(), allianceVotes: z.array(allianceVoteSchema).optional(), treaties: z.array(treatySchema).optional(), spyMissions: z.array(spyMissionSchema).optional(), worldEvents: z.array(worldEventSchema).optional(), onboarding: onboardingProgressSchema.optional(), dailyQuests: dailyQuestSnapshotSchema.optional() });
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

export const buildCommandSchema = z.object({
  commandId: z.string().min(8),
  cityId: z.string(),
  buildingId: z.enum(buildingIds),
  queueType: z.enum(["build", "research"]).default("build"),
  plotX: z.number().int().nonnegative().safe().optional(),
  plotY: z.number().int().nonnegative().safe().optional(),
  plotRotation: cityRotationSchema.optional(),
}).refine(command => (command.plotX === undefined) === (command.plotY === undefined), {
  message: "plotX and plotY must be provided together",
}).refine(command => command.plotX !== undefined || command.plotRotation === undefined, {
  message: "plotRotation cannot be provided without plotX and plotY",
});
export type BuildCommand = z.infer<typeof buildCommandSchema>;

export const cityLayoutCommandSchema = z.object({
  commandId: z.string().min(8),
  cityId: z.string(),
  layoutVersion: z.literal(2),
  expectedRevision: z.number().int().nonnegative(),
  placements: z.array(buildingPlacementSchema),
});
export type CityLayoutCommand = z.infer<typeof cityLayoutCommandSchema>;
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
export const assignCommanderCommandSchema = z.object({ commandId: z.string().min(8), armyId: z.string(), commanderId: z.string() });
export type AssignCommanderCommand = z.infer<typeof assignCommanderCommandSchema>;
export const updateArmyCompositionCommandSchema = z.object({ commandId: z.string().min(8), armyId: z.string(), composition: armyCompositionSchema, stance: z.enum(battleStances) });
export type UpdateArmyCompositionCommand = z.infer<typeof updateArmyCompositionCommandSchema>;
export const saveFormationPresetCommandSchema = z.object({ commandId: z.string().min(8), name: z.string().trim().min(1).max(40), composition: armyCompositionSchema, stance: z.enum(battleStances) });
export type SaveFormationPresetCommand = z.infer<typeof saveFormationPresetCommandSchema>;
export const applyFormationPresetCommandSchema = z.object({ commandId: z.string().min(8), armyId: z.string(), presetId: z.string() });
export type ApplyFormationPresetCommand = z.infer<typeof applyFormationPresetCommandSchema>;
export const startResearchCommandSchema = z.object({ commandId: z.string().min(8), technologyId: z.enum(technologyIds) });
export type StartResearchCommand = z.infer<typeof startResearchCommandSchema>;
export const completeCampaignMissionCommandSchema = z.object({ commandId: z.string().min(8), missionId: z.string(), armyId: z.string().optional() });
export type CompleteCampaignMissionCommand = z.infer<typeof completeCampaignMissionCommandSchema>;
export const patrolCampaignCommandSchema = z.object({ commandId: z.string().min(8), missionId: z.string(), armyId: z.string() });
export type PatrolCampaignCommand = z.infer<typeof patrolCampaignCommandSchema>;
export const recruitReserveCommandSchema = z.object({ commandId: z.string().min(8), cityId: z.string(), troopType: z.enum(troopTypes), amount: z.number().int().min(10).max(50) });
export type RecruitReserveCommand = z.infer<typeof recruitReserveCommandSchema>;
export const createArmyCommandSchema = z.object({ commandId: z.string().min(8), cityId: z.string(), commanderId: z.string(), composition: armyCompositionSchema, stance: z.enum(battleStances).default("balanced") });
export type CreateArmyCommand = z.infer<typeof createArmyCommandSchema>;
export const reinforceArmyCommandSchema = z.object({ commandId: z.string().min(8), armyId: z.string(), troopType: z.enum(troopTypes), amount: z.number().int().positive(), position: z.enum(armyPositions) });
export type ReinforceArmyCommand = z.infer<typeof reinforceArmyCommandSchema>;
export const transferArmyCommandSchema = z.object({ commandId: z.string().min(8), sourceArmyId: z.string(), targetArmyId: z.string(), troopType: z.enum(troopTypes), amount: z.number().int().positive(), sourcePosition: z.enum(armyPositions), targetPosition: z.enum(armyPositions) });
export type TransferArmyCommand = z.infer<typeof transferArmyCommandSchema>;
export const returnArmyHomeCommandSchema = z.object({ commandId: z.string().min(8), armyId: z.string() });
export type ReturnArmyHomeCommand = z.infer<typeof returnArmyHomeCommandSchema>;

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
export const trainTroopsCommandSchema = z.object({ commandId: z.string().min(8), cityId: z.string(), troopType: z.enum(troopTypes), amount: z.number().int().min(10).max(50) });
export type TrainTroopsCommand = z.infer<typeof trainTroopsCommandSchema>;
export const healTroopsCommandSchema = z.object({ commandId: z.string().min(8), cityId: z.string(), troopType: z.enum(troopTypes), amount: z.number().int().positive().max(500) });
export type HealTroopsCommand = z.infer<typeof healTroopsCommandSchema>;

export type ClientMessage = { type: "BUILD_START"; payload: BuildCommand }
  | { type: "ATTACK"; payload: AttackCommand }
  | { type: "MOVE_ARMY"; payload: MoveArmyCommand }
  | { type: "RECRUIT"; payload: RecruitCommand }
  | { type: "SET_FORMATION"; payload: SetFormationCommand }
  | { type: "ASSIGN_COMMANDER"; payload: AssignCommanderCommand }
  | { type: "UPDATE_ARMY_COMPOSITION"; payload: UpdateArmyCompositionCommand }
  | { type: "PATROL_CAMPAIGN"; payload: PatrolCampaignCommand }
  | { type: "MERGE_ARMY"; payload: MergeArmyCommand }
  | { type: "CREATE_ALLIANCE"; payload: CreateAllianceCommand }
  | { type: "JOIN_ALLIANCE"; payload: JoinAllianceCommand }
  | { type: "LEAVE_ALLIANCE"; payload: LeaveAllianceCommand }
  | { type: "CONTRIBUTE_ALLIANCE"; payload: ContributeAllianceCommand }
  | { type: "PROPOSE_TREATY"; payload: ProposeTreatyCommand }
  | { type: "RESPOND_TREATY"; payload: RespondTreatyCommand }
  | { type: "BREAK_TREATY"; payload: BreakTreatyCommand }
  | { type: "LAUNCH_SPY"; payload: LaunchSpyCommand }
  | { type: "COUNTER_INTEL"; payload: CounterIntelCommand }
  | { type: "CITY_LAYOUT"; payload: CityLayoutCommand };
  
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
  // Scaled against a quarter of the world rather than a flat 5 points a tile. The flat rate
  // saturated at 60 tiles — less than one of the sixteen provinces — so holding a single
  // province paid the same 300 as holding half the map, which turned 30% of the military axis
  // into a switch with two positions. `gameRules.territory` is read at call time so the rule
  // has one home; nothing calls this during module evaluation.
  const territoryScore = Math.min(300, Math.floor((stats.tilesControlled * 300) / gameRules.territory.fullScoreTiles));
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
  cityInterior: {
    baseSize: 12,
    maxSize: 20,
    sizePerTownHallLevel: 2,
  } as const,
  buildings: {
    town_hall: { id: "town_hall", name: "Tòa thị chính", description: "Trung tâm thành phố; mỗi cấp mở rộng thêm hai hàng và hai cột nội thành.", cost: { food: 0, wood: 100, stone: 50, iron: 0 }, durationSeconds: 10 },
    warehouse: { id: "warehouse", name: "Nhà kho", description: "Tăng sức chứa nguyên liệu của thành phố.", cost: { food: 0, wood: 80, stone: 25, iron: 0 }, durationSeconds: 8 },
    road_depot: { id: "road_depot", name: "Trạm tiếp tế", description: "Mở tuyến vận tải; tăng hồi phục tiếp tế quân đội gần khu.", cost: { food: 0, wood: 120, stone: 80, iron: 20 }, durationSeconds: 12 },
    barracks: { id: "barracks", name: "Doanh trại", description: "Cho phép tuyển mộ quân đội trong thành phố.", cost: { food: 0, wood: 150, stone: 100, iron: 50 }, durationSeconds: 15 },
    farm: { id: "farm", name: "Nông trại", description: "Sản xuất lương thực tự động và tăng kho lương của thành phố.", cost: { food: 0, wood: 90, stone: 30, iron: 0 }, durationSeconds: 12 },
    lumber_mill: { id: "lumber_mill", name: "Xưởng gỗ", description: "Sản xuất gỗ tự động cho xây dựng và huấn luyện.", cost: { food: 0, wood: 110, stone: 35, iron: 0 }, durationSeconds: 14 },
    stone_quarry: { id: "stone_quarry", name: "Mỏ đá", description: "Sản xuất đá tự động cho công trình phòng thủ.", cost: { food: 0, wood: 100, stone: 45, iron: 10 }, durationSeconds: 14 },
    academy: { id: "academy", name: "Học viện", description: "Mở hàng đợi nghiên cứu công nghệ và đào tạo chỉ huy.", cost: { food: 0, wood: 180, stone: 140, iron: 80 }, durationSeconds: 18 },
    hospital: { id: "hospital", name: "Quân y viện", description: "Chữa thương binh theo hàng đợi bằng lương thực.", cost: { food: 0, wood: 140, stone: 120, iron: 60 }, durationSeconds: 18 },
  } as const,
  recruitment: {
    infantry: { id: "infantry", name: "Bộ binh", description: "Cân bằng, mạnh chống cung thủ.", cost: { wood: 50, stone: 30, iron: 10 } },
    cavalry: { id: "cavalry", name: "Kỵ binh", description: "Nhanh nhẹn, mạnh chống bộ binh.", cost: { wood: 30, stone: 20, iron: 40 } },
    archer: { id: "archer", name: "Cung thủ", description: "Tầm xa, mạnh chống kỵ binh.", cost: { wood: 40, stone: 10, iron: 20 } },
  } as const,
  production: {
    catchUpLimitSeconds: 8 * 60 * 60,
    warehouseBaseCapacity: 1000,
    warehouseCapacityPerLevel: 500,
    perMinute: { farm: 10, lumber_mill: 8, stone_quarry: 6 },
  } as const,
  army: {
    maxStrengthPerArmy: 500,
    recruitAmountStep: 10, recruitAmountMin: 10, recruitAmountMax: 50,
    formationCost: 0,
  } as const,
  training: {
    queueLimit: 1,
    amountMin: 10,
    amountMax: 50,
    durationSecondsPerTroop: 1,
    costPerTroop: {
      shield_infantry: { food: 1, wood: 1, stone: 1, iron: 0 },
      spearmen: { food: 1, wood: 1, stone: 1, iron: 1 },
      archers: { food: 1, wood: 2, stone: 0, iron: 1 },
      cavalry: { food: 2, wood: 1, stone: 0, iron: 2 },
    },
  } as const,
  hospital: {
    foodPerTroop: 1,
    durationSecondsPerTroop: 1,
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
    /** How far a city must sit from a port. The ports themselves — where they are and what they
     *  are called — are authored in `world-map.ts`, four of them now, so this rule carries no
     *  name or tile of its own that could drift away from the map. Prose that has to say "a port"
     *  before the player picks one says it in the player's language, in the panel that asks. */
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
  logistics: {
    /** How far a city may reach a mine. This was a bare `10` inside `logistics.ts`, which was half
     *  the width of the 20-wide world it was written for — with three mines in the middle of that
     *  world it never refused anything. Written as half the extent it goes on meaning the same
     *  thing on a map three times the size; left at 10 it would strand a third of the city sites
     *  with no iron within reach, and a player there runs out after the starter package with no
     *  local source at all. Which resources a city can actually reach is now a placement rule, so
     *  lowering this deliberately — to make trade the answer for what you cannot mine — shrinks
     *  capacity rather than quietly producing dead-end cities: 12 gives 120 sites, 14 gives 130,
     *  this gives 135. */
    harvestRange: mapExtent / 2,
  } as const,
  territory: {
    /** Manhattan distance from a province seat an army must be within to claim the province.
     *  One tile: standing beside the seat, not merely somewhere in the province — a province is
     *  eighty tiles and "somewhere in it" would make control a thing you drift into. Nearest
     *  live army wins, a tie leaves the province unheld, and NPCs never contest (a raider
     *  parked on a seat would otherwise make a province nobody can hold). */
    captureRadius: 1,
    /** Tiles that earn the full 300 territory points: a quarter of the world, which is about
     *  four of the sixteen provinces (they run 79–83 tiles, so it is four of the larger ones or
     *  a bit more of the smaller). Written as a share of the map so resizing the world keeps the
     *  meaning instead of quietly making territory cheaper or dearer. */
    fullScoreTiles: (mapExtent * mapExtent) / 4,
  } as const,
  cityPlacement: {
    minX: placementMargin, maxX: mapExtent - 1 - placementMargin,
    minY: placementMargin, maxY: mapExtent - 1 - placementMargin,
    /** Not loosened, and that is the point: cities stay three tiles apart, so the capacity of a
     *  kingdom is a property of how many anchors the map authors, not of how tightly towns may be
     *  packed. */
    minDistanceBetweenCities: 3,
    /** Reach from a port or a mine. Two gave 111 sites on the authored world — under the 120 the
     *  load-test profile seeds — and buying the difference with more anchors would mean 49 of them,
     *  past what is worth drawing by hand. Three gives 135, and a city three tiles from its mine is
     *  still a city that grew around it. */
    maxDistanceToHubOrNode: 3,
  } as const,
  campaign: {
    /** Manhattan distance from the mission target an army counts as "at the objective". Three
     *  rather than zero: a 3D terrain click can land a tile or two off, and three tiles is still
     *  "arrived" for gameplay (same leniency as the caravan ambush range). */
    arrivalRadius: 3,
    /** Resources granted to the army's home city on every patrol victory, by the chapter of the
     *  mission being patrolled. Chapter 1 is about half a road depot, chapter 2 pays one back,
     *  chapter 3 sits between a depot and a barracks. Losses and draws pay nothing. */
    patrolRewards: {
      1: { wood: 60, stone: 40, iron: 10 },
      2: { wood: 120, stone: 80, iron: 25 },
      3: { wood: 200, stone: 140, iron: 40 },
    } as const,
  } as const,
} as const;

/** Visible square side of a city. Level one starts at 12x12; upgrading the town
 * hall grows both dimensions until the authored cap of 20x20. Kept in shared so server
 * validation and the client grid can never disagree about the boundary. */
export function cityGridSize(townHallLevel: number): number {
  const level = Number.isFinite(townHallLevel) ? Math.max(1, Math.trunc(townHallLevel)) : 1;
  return Math.min(gameRules.cityInterior.maxSize, gameRules.cityInterior.baseSize + (level - 1) * gameRules.cityInterior.sizePerTownHallLevel);
}

export const buildingBaseFootprints: Record<BuildingId, { width: number; height: number }> = {
  town_hall: { width: 3, height: 3 },
  warehouse: { width: 2, height: 2 },
  road_depot: { width: 3, height: 2 },
  barracks: { width: 3, height: 3 },
  farm: { width: 2, height: 2 },
  lumber_mill: { width: 3, height: 2 },
  stone_quarry: { width: 3, height: 2 },
  academy: { width: 3, height: 3 },
  hospital: { width: 3, height: 2 },
};

export function buildingDimensions(buildingId: BuildingId, rotation: CityRotation = 0): { width: number; height: number } {
  const base = buildingBaseFootprints[buildingId] ?? { width: 1, height: 1 };
  if (rotation === 90 || rotation === 270) {
    return { width: base.height, height: base.width };
  }
  return { width: base.width, height: base.height };
}

export function buildingOccupiedTiles(placement: { buildingId: BuildingId; x: number; y: number; rotation?: CityRotation }): Array<{ x: number; y: number }> {
  const { width, height } = buildingDimensions(placement.buildingId, placement.rotation ?? 0);
  const tiles: Array<{ x: number; y: number }> = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      tiles.push({ x: placement.x + dx, y: placement.y + dy });
    }
  }
  return tiles;
}

export function isPlacementWithinBounds(
  placement: { buildingId: BuildingId; x: number; y: number; rotation?: CityRotation },
  size: number
): boolean {
  const { width, height } = buildingDimensions(placement.buildingId, placement.rotation ?? 0);
  return (
    Number.isInteger(placement.x) &&
    Number.isInteger(placement.y) &&
    placement.x >= 0 &&
    placement.y >= 0 &&
    placement.x + width <= size &&
    placement.y + height <= size
  );
}

export function validatePlacements(
  placements: BuildingPlacement[],
  gridSize: number
): { valid: boolean; error?: "CITY_PLOT_OUT_OF_BOUNDS" | "CITY_PLOT_OCCUPIED" | "INVALID_BUILDING_ROTATION" } {
  const occupied = new Set<string>();
  for (const placement of placements) {
    if (!cityRotations.includes(placement.rotation)) {
      return { valid: false, error: "INVALID_BUILDING_ROTATION" };
    }
    if (!isPlacementWithinBounds(placement, gridSize)) {
      return { valid: false, error: "CITY_PLOT_OUT_OF_BOUNDS" };
    }
    const tiles = buildingOccupiedTiles(placement);
    for (const tile of tiles) {
      const key = `${tile.x},${tile.y}`;
      if (occupied.has(key)) {
        return { valid: false, error: "CITY_PLOT_OCCUPIED" };
      }
      occupied.add(key);
    }
  }
  return { valid: true };
}

/** Deterministic migration from v1 layout (5-9 grid, 1x1 plots) to v2 layout (12-20 grid, multi-tile footprints). */
export function migrateCityLayoutV1toV2(city: {
  buildings?: Record<string, number>;
  buildingPlots?: Array<{ buildingId: BuildingId; x: number; y: number; rotation?: CityRotation }>;
  queues?: Array<{ buildingId: string; plotX?: number; plotY?: number; plotRotation?: CityRotation }>;
}): BuildingPlacement[] {
  const townHallLevel = city.buildings?.town_hall ?? 1;
  const oldSize = Math.min(9, 5 + (townHallLevel - 1) * 1);
  const newSize = cityGridSize(townHallLevel);

  const required = new Set<BuildingId>();
  for (const id of buildingIds) {
    if ((city.buildings?.[id] ?? 0) > 0) required.add(id);
  }
  for (const q of city.queues ?? []) {
    if (buildingIds.includes(q.buildingId as BuildingId)) required.add(q.buildingId as BuildingId);
  }
  if (!required.has("town_hall")) required.add("town_hall");

  const occupiedTiles = new Set<string>();
  const results: BuildingPlacement[] = [];

  const canPlace = (bId: BuildingId, px: number, py: number, rot: CityRotation = 0): boolean => {
    if (!isPlacementWithinBounds({ buildingId: bId, x: px, y: py, rotation: rot }, newSize)) return false;
    const tiles = buildingOccupiedTiles({ buildingId: bId, x: px, y: py, rotation: rot });
    return tiles.every(t => !occupiedTiles.has(`${t.x},${t.y}`));
  };

  const commitPlacement = (placement: BuildingPlacement) => {
    results.push(placement);
    for (const t of buildingOccupiedTiles(placement)) {
      occupiedTiles.add(`${t.x},${t.y}`);
    }
  };

  // 1. Process town_hall first
  const existingTh = (city.buildingPlots ?? []).find(p => p.buildingId === "town_hall");
  const thBaseCenter = Math.floor((newSize - 3) / 2);
  let thTargetX = thBaseCenter;
  let thTargetY = thBaseCenter;
  if (existingTh && Number.isInteger(existingTh.x) && Number.isInteger(existingTh.y)) {
    const relX = (existingTh.x + 0.5) / oldSize;
    const relY = (existingTh.y + 0.5) / oldSize;
    thTargetX = Math.max(0, Math.min(newSize - 3, Math.floor(relX * newSize - 1.5)));
    thTargetY = Math.max(0, Math.min(newSize - 3, Math.floor(relY * newSize - 1.5)));
  }
  commitPlacement({ buildingId: "town_hall", x: thTargetX, y: thTargetY, rotation: 0 });

  // 2. Process other required buildings in stable buildingIds order
  for (const buildingId of buildingIds) {
    if (buildingId === "town_hall" || !required.has(buildingId)) continue;
    const existing = (city.buildingPlots ?? []).find(p => p.buildingId === buildingId);
    const { width, height } = buildingDimensions(buildingId, 0);

    let idealX: number;
    let idealY: number;
    if (existing && Number.isInteger(existing.x) && Number.isInteger(existing.y)) {
      const relX = (existing.x + 0.5) / oldSize;
      const relY = (existing.y + 0.5) / oldSize;
      idealX = Math.max(0, Math.min(newSize - width, Math.floor(relX * newSize - width / 2)));
      idealY = Math.max(0, Math.min(newSize - height, Math.floor(relY * newSize - height / 2)));
    } else {
      idealX = Math.max(0, Math.min(newSize - width, thTargetX));
      idealY = Math.max(0, Math.min(newSize - height, thTargetY));
    }

    if (canPlace(buildingId, idealX, idealY, 0)) {
      commitPlacement({ buildingId, x: idealX, y: idealY, rotation: 0 });
      continue;
    }

    // Find closest Manhattan valid position, tie-break y then x
    let bestX = -1;
    let bestY = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let y = 0; y <= newSize - height; y++) {
      for (let x = 0; x <= newSize - width; x++) {
        if (canPlace(buildingId, x, y, 0)) {
          const dist = Math.abs(x - idealX) + Math.abs(y - idealY);
          if (dist < bestDist) {
            bestDist = dist;
            bestX = x;
            bestY = y;
          }
        }
      }
    }
    if (bestX >= 0 && bestY >= 0) {
      commitPlacement({ buildingId, x: bestX, y: bestY, rotation: 0 });
    }
  }

  return results;
}

export type RecruitUnitId = keyof typeof gameRules.recruitment;

// Recruitment is priced per pack of `recruitAmountStep` troops: cost × (amount / step).
// Single source of truth used by the server to charge and the client to preview.
export function recruitmentCost(unitType: RecruitUnitId, amount: number): { wood: number; stone: number; iron: number } {
  const { cost } = gameRules.recruitment[unitType];
  const multiplier = amount / gameRules.army.recruitAmountStep;
  return { wood: cost.wood * multiplier, stone: cost.stone * multiplier, iron: cost.iron * multiplier };
}

/** The authored world, re-exported through the barrel because the package has no subpath
 *  exports: `@kingdoms/shared` is the one door, and both the server's terrain seed and the
 *  client's terrain bake come through it — which is the mechanism that stops them drifting
 *  apart. Kept at the bottom so `world-map.ts`'s own imports of nothing stay obvious. */
export * from "./world-map.js";

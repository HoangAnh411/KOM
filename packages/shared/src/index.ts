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

export const caravanSchema = z.object({ id: z.string(), ownerPlayerId: z.string(), sourceCityId: z.string(), destinationCityId: z.string(), progress: z.number().min(0).max(1), status: z.enum(["moving", "delivered", "ambushed"]) });
export type Caravan = z.infer<typeof caravanSchema>;
export const armySchema = z.object({ id: z.string(), ownerPlayerId: z.string(), x: z.number().int(), y: z.number().int(), unitType: z.enum(["infantry", "cavalry", "archer"]), strength: z.number().int().positive() });
export type Army = z.infer<typeof armySchema>;
export const heroSchema = z.object({ id: z.string(), ownerPlayerId: z.string(), name: z.string(), x: z.number().int(), y: z.number().int() });
export type Hero = z.infer<typeof heroSchema>;

export const snapshotSchema = z.object({ kingdom: z.object({ id: z.string(), name: z.string() }), season: z.object({ id: z.string(), status: z.enum(["SCHEDULED", "ACTIVE", "FINALIZING", "CLOSED"]), endsAt: z.string() }), cities: z.array(citySchema), caravans: z.array(caravanSchema), armies: z.array(armySchema), heroes: z.array(heroSchema), scores: z.record(scoreSchema), factionCatalog: z.record(z.object({ name: z.string(), description: z.string() })) });
export type WorldSnapshot = z.infer<typeof snapshotSchema>;

export const buildCommandSchema = z.object({ commandId: z.string().min(8), cityId: z.string(), buildingId: z.enum(["town_hall", "warehouse", "road_depot"]), queueType: z.enum(["build", "research"]).default("build") });
export type BuildCommand = z.infer<typeof buildCommandSchema>;

export type ClientMessage = { type: "BUILD_START"; payload: BuildCommand };
export type ServerMessage = { type: "SNAPSHOT"; payload: WorldSnapshot } | { type: "ERROR"; code: string; message: string } | { type: "EVENT"; event: string; payload: unknown };

export const seasonWeights = { military: 0.4, economy: 0.35, diplomacy: 0.25 } as const;
export function overallScore(scores: Pick<Scores, "military" | "economy" | "diplomacy">): number {
  return scores.military * seasonWeights.military + scores.economy * seasonWeights.economy + scores.diplomacy * seasonWeights.diplomacy;
}

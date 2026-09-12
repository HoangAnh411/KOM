import { randomUUID } from "node:crypto";
import { regions, type Army, type RivalIntent } from "@kingdoms/shared";
import type { GameState } from "./types.js";
import { ensureNpcCommander, npcComposition } from "./army-model.js";

const intentDelayMs = 8_000;
const actionIntervalMs = 10_000;
const hash = (value: string): number => [...value].reduce((total, char) => (Math.imul(total, 31) + char.charCodeAt(0)) >>> 0, 17);

export class RivalEngine {
  seed(state: GameState, now = Date.now()): void {
    state.rivalIntents ??= [];
    if (state.armies.some(army => army.npcKind === "rival")) return;
    const region = regions[hash(state.kingdom.id) % regions.length]!;
    const id = randomUUID(); const strength = 80;
    ensureNpcCommander(state, "npc-commander-rival-infantry", "Tướng đối địch", "infantry", 3);
    state.armies.push({ id, ownerType: "npc", ownerPlayerId: null, npcKind: "rival", x: region.seatX, y: region.seatY, unitType: "infantry", strength, morale: 100, formation: "line", supply: 100, lastSupplyAt: new Date(now).toISOString(), nextActionAt: new Date(now + actionIntervalMs).toISOString(), commanderId: "npc-commander-rival-infantry", composition: npcComposition(id, "infantry", strength), stance: "balanced" });
  }

  tick(state: GameState, now = Date.now()): boolean {
    this.seed(state, now); let changed = false;
    state.rivalIntents = state.rivalIntents.filter(intent => state.armies.some(army => army.id === intent.armyId));
    for (const army of state.armies.filter(item => item.npcKind === "rival" && item.strength > 0)) {
      const existing = state.rivalIntents.find(intent => intent.armyId === army.id);
      if (!existing) { state.rivalIntents.push(this.plan(army, state, now)); changed = true; continue; }
      if (Date.parse(existing.actsAt) > now) continue;
      if (army.x !== existing.targetX || army.y !== existing.targetY) {
        if (Math.abs(existing.targetX - army.x) >= Math.abs(existing.targetY - army.y)) army.x += existing.targetX > army.x ? 1 : -1;
        else army.y += existing.targetY > army.y ? 1 : -1;
      }
      army.nextActionAt = new Date(now + actionIntervalMs).toISOString();
      state.rivalIntents = state.rivalIntents.filter(intent => intent.armyId !== army.id);
      changed = true;
    }
    return changed;
  }

  private plan(army: Army, state: GameState, now: number): RivalIntent {
    const heldByPlayer = regions.filter(region => Boolean(state.regionControl[region.code]));
    const target = (heldByPlayer.length ? heldByPlayer : regions)[hash(`${state.season.id}:${army.x}:${army.y}:${army.nextActionAt ?? now}`) % (heldByPlayer.length || regions.length)]!;
    const lowSupply = army.supply < 30 || army.strength < 35;
    const goal: RivalIntent["goal"] = lowSupply ? "withdraw" : state.regionControl[target.code] ? "contest" : "raid";
    const home = regions[hash(army.id) % regions.length]!;
    return { armyId: army.id, goal, targetX: lowSupply ? home.seatX : target.seatX, targetY: lowSupply ? home.seatY : target.seatY, targetRegionCode: lowSupply ? home.code : target.code, announcedAt: new Date(now).toISOString(), actsAt: new Date(now + intentDelayMs).toISOString() };
  }
}

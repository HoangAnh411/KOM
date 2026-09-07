import type { Army, ArmyComposition, ArmySquad, Commander, CommanderSpecialty, TroopType, UnitType } from "@kingdoms/shared";
import { armyCompositionTotal, armyPositions, emptyTroopCounts } from "@kingdoms/shared";
import type { GameState } from "./types.js";

/** The legacy single-type model mapped onto the composition model, so a
 *  pre-composition army can be resolved by the same mixed battle engine
 *  instead of drifting out of sync with a composition it does not have. */
const troopTypeOfUnit: Record<UnitType, TroopType> = { infantry: "shield_infantry", archer: "archers", cavalry: "cavalry" };
const specialtyOfUnit: Record<UnitType, CommanderSpecialty> = { infantry: "infantry", archer: "archer", cavalry: "cavalry" };

export const troopTypeForUnit = (unitType: UnitType): TroopType => troopTypeOfUnit[unitType];
export const specialtyForUnit = (unitType: UnitType): CommanderSpecialty => specialtyOfUnit[unitType];

/** Coarse unit type mirrored from a composition for the legacy map/UI fields. */
export function legacyUnitTypeOf(composition: ArmyComposition): Army["unitType"] {
  const counts = emptyTroopCounts();
  for (const position of armyPositions) {
    const squad = composition[position];
    if (squad) counts[squad.troopType] += squad.count;
  }
  if (counts.cavalry >= counts.archers && counts.cavalry >= counts.shield_infantry + counts.spearmen) return "cavalry";
  if (counts.archers >= counts.shield_infantry + counts.spearmen) return "archer";
  return "infantry";
}

/** A squad must keep a positive count to satisfy `armySquadSchema`, so a battle
 *  that empties a position nulls it instead of leaving `count: 0` behind. */
export function dropEmptySquads(composition: ArmyComposition): ArmyComposition {
  return {
    frontline: composition.frontline && composition.frontline.count > 0 ? composition.frontline : null,
    backline: composition.backline && composition.backline.count > 0 ? composition.backline : null,
    flank: composition.flank && composition.flank.count > 0 ? composition.flank : null,
  };
}

/** Removes troops from a composition army, largest squad first, keeping
 *  `strength`/`unitType` in sync — the group-model equivalent of the old
 *  strength-only attrition. Like that code, this grounds an army at one troop
 *  rather than destroying it. Returns the number of troops actually removed. */
export function applyCompositionLosses(army: Army, losses: number): number {
  const composition = army.composition;
  if (!composition || losses <= 0) return 0;
  const total = armyCompositionTotal(composition);
  if (total <= 1) return 0;
  let toRemove = Math.min(Math.floor(losses), total - 1);
  const target = toRemove;
  while (toRemove > 0) {
    const squads = armyPositions.map(position => composition[position]).filter((squad): squad is ArmySquad => Boolean(squad && squad.count > 0));
    if (!squads.length) break;
    const largest = squads.reduce((left, right) => (right.count > left.count ? right : left));
    const take = Math.min(largest.count, toRemove);
    largest.count -= take;
    toRemove -= take;
  }
  army.composition = dropEmptySquads(composition);
  army.strength = armyCompositionTotal(army.composition);
  army.unitType = legacyUnitTypeOf(army.composition);
  return target - toRemove;
}

/** Detaches a commander from an army that is being removed. Every branch that
 *  deletes an army must go through here, or the commander stays assigned to a
 *  nonexistent army and can never lead again. */
export function releaseCommander(state: GameState, army: Army): void {
  const commander = state.commanders.find(item => item.id === army.commanderId);
  if (commander?.assignedArmyId === army.id) commander.assignedArmyId = undefined;
  army.commanderId = undefined;
}

/** NPC commanders are shared per kind+specialty and recreated on demand, the
 *  same way campaign commanders are. They never hold an assignment slot. */
export function ensureNpcCommander(state: GameState, id: string, name: string, specialty: CommanderSpecialty, level = 1): Commander {
  const existing = state.commanders.find(item => item.id === id);
  if (existing) return existing;
  const commander: Commander = { id, ownerPlayerId: "npc", name, specialty, level, xp: 0, neutral: true };
  state.commanders.push(commander);
  return commander;
}

/** A world NPC as the composition model sees it: one squad of its legacy unit
 *  type, led by its kind's neutral commander. */
export function npcComposition(armyId: string, unitType: UnitType, strength: number): ArmyComposition {
  return { frontline: { id: `${armyId}-npc-frontline`, troopType: troopTypeForUnit(unitType), position: "frontline", count: strength }, backline: null, flank: null };
}

export function npcCommanderFor(state: GameState, army: { npcKind?: string; unitType: UnitType }): Commander {
  const kind = army.npcKind === "migration" ? "migration" : "raider";
  const specialty = specialtyForUnit(army.unitType);
  return ensureNpcCommander(state, `npc-commander-${kind}-${specialty}`, kind === "raider" ? "Thủ lĩnh cướp" : "Thủ lĩnh di cư", specialty);
}

/** Upgrades persisted pre-composition NPC armies to the group model so world
 *  combat resolves through the mixed engine instead of the legacy fallback. */
export function normalizeNpcArmy(state: GameState, army: Army): void {
  if (army.ownerType !== "npc" || army.composition || army.strength <= 0) return;
  army.composition = npcComposition(army.id, army.unitType, army.strength);
  army.stance = army.stance ?? "balanced";
  army.commanderId = npcCommanderFor(state, army).id;
  army.wounded ??= emptyTroopCounts();
}

export function normalizeNpcArmies(state: GameState): void {
  for (const army of state.armies) normalizeNpcArmy(state, army);
}

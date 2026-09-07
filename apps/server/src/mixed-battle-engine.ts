import type {
  ArmyComposition,
  ArmyPosition,
  ArmySquad,
  BattleStance,
  CommanderSpecialty,
  TerrainType,
  TroopType,
} from "@kingdoms/shared";
import { armyCompositionTotal, troopTypes } from "@kingdoms/shared";

export type MixedBattleSide = {
  composition: ArmyComposition;
  commander: { specialty: CommanderSpecialty; level: number };
  stance: BattleStance;
  morale: number;
  supply: number;
};

export type MixedBattleInput = {
  attacker: MixedBattleSide;
  defender: MixedBattleSide;
  terrain: TerrainType;
  seed: number;
};

export type MixedBattleGroupResult = {
  squadId: string;
  troopType: TroopType;
  position: ArmyPosition;
  countBefore: number;
  countAfter: number;
  casualties: number;
};

export type MixedBattleAction = {
  sourceSquadId: string;
  targetSquadId: string;
  skill?: string;
};

export type MixedBattleRound = {
  round: number;
  attacker: MixedBattleGroupResult[];
  defender: MixedBattleGroupResult[];
  actions: MixedBattleAction[];
  explanations: string[];
};

export type MixedBattleOutput = {
  rounds: MixedBattleRound[];
  attacker: { composition: ArmyComposition; totalAfter: number; moraleAfter: number; wounded: number };
  defender: { composition: ArmyComposition; totalAfter: number; moraleAfter: number; wounded: number };
  victor: "attacker" | "defender" | "draw";
};

export type CasualtyAllocation = Record<TroopType, { losses: number; killed: number; wounded: number }>;

// The single source for the killed/wounded split. 20% of each troop type's
// losses die outright, the remaining 80% are wounded and recoverable through
// the hospital. Both the battle report and the army's wounded cargo read this
// one allocation, so the numbers a player sees always match what the server
// recorded — and the rounding is per troop type, never per side.
export function allocateCasualties(rounds: MixedBattleRound[], side: "attacker" | "defender"): CasualtyAllocation {
  const losses = { shield_infantry: 0, spearmen: 0, archers: 0, cavalry: 0 } as Record<TroopType, number>;
  for (const round of rounds) {
    for (const group of round[side]) losses[group.troopType] += group.casualties;
  }
  const allocation = {} as CasualtyAllocation;
  for (const troopType of troopTypes) {
    const typeLosses = losses[troopType];
    allocation[troopType] = { losses: typeLosses, killed: Math.floor(typeLosses * 0.2), wounded: typeLosses - Math.floor(typeLosses * 0.2) };
  }
  return allocation;
}

const squadOrder: ArmyPosition[] = ["frontline", "backline", "flank"];
const baseStats: Record<TroopType, { attack: number; defense: number }> = {
  shield_infantry: { attack: 1.0, defense: 1.25 },
  spearmen: { attack: 1.05, defense: 1.0 },
  archers: { attack: 1.2, defense: 0.65 },
  cavalry: { attack: 1.25, defense: 0.9 },
};

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function copyComposition(composition: ArmyComposition): ArmyComposition {
  return {
    frontline: composition.frontline ? { ...composition.frontline } : null,
    backline: composition.backline ? { ...composition.backline } : null,
    flank: composition.flank ? { ...composition.flank } : null,
  };
}

function aliveSquads(composition: ArmyComposition): ArmySquad[] {
  return squadOrder.map(position => composition[position]).filter((squad): squad is ArmySquad => Boolean(squad && squad.count > 0));
}

function hasLivingFrontlineTroop(composition: ArmyComposition, troopType: TroopType): boolean {
  return composition.frontline?.troopType === troopType && composition.frontline.count > 0;
}

function targetFor(source: ArmySquad, enemy: ArmyComposition): ArmySquad | undefined {
  const livingFrontline = enemy.frontline && enemy.frontline.count > 0 ? enemy.frontline : undefined;
  const livingBackline = enemy.backline && enemy.backline.count > 0 ? enemy.backline : undefined;
  const livingFlank = enemy.flank && enemy.flank.count > 0 ? enemy.flank : undefined;

  if (source.position === "flank" && source.troopType === "cavalry" && !hasLivingFrontlineTroop(enemy, "spearmen")) {
    return livingBackline ?? livingFrontline ?? livingFlank;
  }
  return livingFrontline ?? livingBackline ?? livingFlank;
}

function terrainFactor(terrain: TerrainType, troopType: TroopType): number {
  if (troopType !== "cavalry") return 1;
  if (terrain === "forest") return 0.7;
  if (terrain === "swamp") return 0.5;
  return 1;
}

function stanceFactors(stance: BattleStance): { attack: number; defense: number } {
  if (stance === "raid") return { attack: 1.15, defense: 0.9 };
  if (stance === "defensive") return { attack: 0.9, defense: 1.1 };
  return { attack: 1, defense: 1 };
}

function capCommanderModifier(value: number): number {
  return Math.max(0.7, Math.min(1.3, value));
}

function attackModifier(side: MixedBattleSide, squad: ArmySquad, round: number, hasFrontline: boolean): number {
  let commanderModifier = 1;
  if (side.commander.specialty === "archer" && squad.troopType === "archers") commanderModifier += 0.1;
  if (side.commander.specialty === "cavalry" && squad.troopType === "cavalry") commanderModifier += 0.1;
  if (side.commander.specialty === "archer" && squad.troopType === "archers" && round === 3) commanderModifier += 0.2;
  if (side.commander.specialty === "cavalry" && squad.troopType === "cavalry" && squad.position === "flank" && round === 1) commanderModifier += 0.2;
  let positionModifier = 1;
  if (squad.troopType === "archers" && hasFrontline) positionModifier += 0.1;
  if (squad.position === "backline" && squad.troopType !== "archers") positionModifier -= 0.15;
  return capCommanderModifier(commanderModifier) * positionModifier;
}

function defenseModifier(side: MixedBattleSide, squad: ArmySquad, round: number): number {
  let commanderModifier = 1;
  if (side.commander.specialty === "infantry" && (squad.troopType === "shield_infantry" || squad.troopType === "spearmen")) commanderModifier -= 0.1;
  if (side.commander.specialty === "infantry" && squad.position === "frontline" && round <= 2) commanderModifier -= 0.1;
  let positionModifier = 1;
  if (squad.position === "frontline" && (squad.troopType === "shield_infantry" || squad.troopType === "spearmen")) positionModifier -= 0.1;
  return capCommanderModifier(commanderModifier) * positionModifier;
}

function applyCasualties(composition: ArmyComposition, damageBySquad: Map<string, number>): MixedBattleGroupResult[] {
  return squadOrder.flatMap(position => {
    const squad = composition[position];
    if (!squad) return [];
    const countBefore = squad.count;
    const casualties = Math.min(countBefore, Math.max(0, Math.floor(damageBySquad.get(squad.id) ?? 0)));
    squad.count -= casualties;
    return [{ squadId: squad.id, troopType: squad.troopType, position, countBefore, countAfter: squad.count, casualties }];
  });
}

function moraleAfter(morale: number, totalBefore: number, losses: number, side: MixedBattleSide, round: number): number {
  const lossPenalty = Math.ceil((losses / Math.max(1, totalBefore)) * 30);
  const logisticsRecovery = side.commander.specialty === "logistics" && round === 3 ? 10 : 0;
  return Math.max(0, Math.min(100, morale - lossPenalty + logisticsRecovery));
}

export function resolveMixedBattle(input: MixedBattleInput): MixedBattleOutput {
  const rng = mulberry32(input.seed);
  const attackerComposition = copyComposition(input.attacker.composition);
  const defenderComposition = copyComposition(input.defender.composition);
  let attackerMorale = Math.max(0, Math.min(100, input.attacker.morale));
  let defenderMorale = Math.max(0, Math.min(100, input.defender.morale));
  const rounds: MixedBattleRound[] = [];

  for (let round = 1; round <= 10; round++) {
    if (!armyCompositionTotal(attackerComposition) || !armyCompositionTotal(defenderComposition)) break;
    const attackerStart = armyCompositionTotal(attackerComposition);
    const defenderStart = armyCompositionTotal(defenderComposition);
    const attackerFrontlineStart = attackerComposition.frontline?.count ?? 0;
    const defenderFrontlineStart = defenderComposition.frontline?.count ?? 0;
    const attackerDamage = new Map<string, number>();
    const defenderDamage = new Map<string, number>();
    const actions: MixedBattleAction[] = [];
    const explanations: string[] = [];
    const attackerStance = stanceFactors(input.attacker.stance);
    const defenderStance = stanceFactors(input.defender.stance);

    for (const source of aliveSquads(attackerComposition)) {
      const target = targetFor(source, defenderComposition);
      if (!target) continue;
      const targetDefense = baseStats[target.troopType].defense * defenderStance.defense;
      const power = source.count * baseStats[source.troopType].attack * attackerStance.attack
        * attackModifier(input.attacker, source, round, Boolean(attackerComposition.frontline?.count))
        * terrainFactor(input.terrain, source.troopType) * (input.attacker.supply >= 50 ? 1 : input.attacker.supply < 25 ? 0.7 : 0.85)
        * (attackerMorale >= 50 ? 1 : attackerMorale < 20 ? 0.6 : 0.8)
        * defenseModifier(input.defender, target, round) / targetDefense;
      const damage = Math.floor(power * (0.85 + rng() * 0.3) / 20);
      attackerDamage.set(target.id, (attackerDamage.get(target.id) ?? 0) + damage);
      const skill = input.attacker.commander.specialty === "archer" && source.troopType === "archers" && round === 3
        ? "Cung thủ bùng nổ hiệp 3"
        : input.attacker.commander.specialty === "cavalry" && source.troopType === "cavalry" && source.position === "flank" && round === 1
          ? "Kỵ binh đột kích cánh"
          : undefined;
      actions.push({ sourceSquadId: source.id, targetSquadId: target.id, ...(skill ? { skill } : {}) });
      if (source.troopType === "cavalry" && source.position === "flank" && target.position === "backline") explanations.push("Cavalry hit the enemy backline from the flank.");
      if (source.troopType === "cavalry" && source.position === "flank" && target.troopType === "spearmen") explanations.push("Spearmen held the frontline and blocked the flank route.");
    }

    for (const source of aliveSquads(defenderComposition)) {
      const target = targetFor(source, attackerComposition);
      if (!target) continue;
      const targetDefense = baseStats[target.troopType].defense * attackerStance.defense;
      const power = source.count * baseStats[source.troopType].attack * defenderStance.attack
        * attackModifier(input.defender, source, round, Boolean(defenderComposition.frontline?.count))
        * terrainFactor(input.terrain, source.troopType) * (input.defender.supply >= 50 ? 1 : input.defender.supply < 25 ? 0.7 : 0.85)
        * (defenderMorale >= 50 ? 1 : defenderMorale < 20 ? 0.6 : 0.8)
        * defenseModifier(input.attacker, target, round) / targetDefense;
      const damage = Math.floor(power * (0.85 + rng() * 0.3) / 20);
      defenderDamage.set(target.id, (defenderDamage.get(target.id) ?? 0) + damage);
      const skill = input.defender.commander.specialty === "archer" && source.troopType === "archers" && round === 3
        ? "Cung thủ bùng nổ hiệp 3"
        : input.defender.commander.specialty === "cavalry" && source.troopType === "cavalry" && source.position === "flank" && round === 1
          ? "Kỵ binh đột kích cánh"
          : undefined;
      actions.push({ sourceSquadId: source.id, targetSquadId: target.id, ...(skill ? { skill } : {}) });
    }

    // Both damage maps are calculated from the same pre-round state.
    const attackerResults = applyCasualties(attackerComposition, defenderDamage);
    const defenderResults = applyCasualties(defenderComposition, attackerDamage);
    const attackerLosses = attackerResults.reduce((sum, result) => sum + result.casualties, 0);
    const defenderLosses = defenderResults.reduce((sum, result) => sum + result.casualties, 0);
    attackerMorale = moraleAfter(attackerMorale, attackerStart, attackerLosses, input.attacker, round);
    defenderMorale = moraleAfter(defenderMorale, defenderStart, defenderLosses, input.defender, round);
    if (attackerFrontlineStart > 0 && (attackerComposition.frontline?.count ?? 0) === 0) explanations.push("The attacker frontline collapsed; remaining groups changed target priority.");
    if (defenderFrontlineStart > 0 && (defenderComposition.frontline?.count ?? 0) === 0) explanations.push("The defender frontline collapsed; remaining groups changed target priority.");
    rounds.push({ round, attacker: attackerResults, defender: defenderResults, actions, explanations: [...new Set(explanations)] });
  }

  const attackerAfter = armyCompositionTotal(attackerComposition);
  const defenderAfter = armyCompositionTotal(defenderComposition);
  const victor = attackerAfter > 0 && defenderAfter === 0 ? "attacker" : defenderAfter > 0 && attackerAfter === 0 ? "defender" : "draw";
  const woundedTotal = (side: "attacker" | "defender"): number =>
    troopTypes.reduce((sum, troopType) => sum + allocateCasualties(rounds, side)[troopType].wounded, 0);
  return {
    rounds,
    attacker: { composition: attackerComposition, totalAfter: attackerAfter, moraleAfter: attackerMorale, wounded: woundedTotal("attacker") },
    defender: { composition: defenderComposition, totalAfter: defenderAfter, moraleAfter: defenderMorale, wounded: woundedTotal("defender") },
    victor,
  };
}

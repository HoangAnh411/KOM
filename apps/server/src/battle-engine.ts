import type { FactionId, Formation, TerrainType, UnitType } from "@kingdoms/shared";
import { counterMatrix, formationModifiers, terrainModifiers } from "@kingdoms/shared";

export type BattleInput = {
  attacker: { unitType: UnitType; strength: number; morale: number; formation: Formation; supply: number; factionId: FactionId };
  defender: { unitType: UnitType; strength: number; morale: number; formation: Formation; supply: number; factionId: FactionId };
  terrain: TerrainType;
  seed: number;
};

export type BattleOutput = {
  rounds: Array<{ round: number; attackerDamage: number; defenderDamage: number; attackerStrength: number; defenderStrength: number }>;
  attacker: { strengthAfter: number; moraleAfter: number };
  defender: { strengthAfter: number; moraleAfter: number };
  victor: "attacker" | "defender" | "draw";
};

// Simple mulberry32 PRNG
function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function supplyFactor(supply: number): number {
  if (supply >= 50) return 1.0;
  if (supply < 25) return 0.7;
  return 0.85;
}

function moraleFactor(morale: number): number {
  if (morale >= 50) return 1.0;
  if (morale < 20) return 0.6;
  return 0.8;
}

export function resolveBattle(input: BattleInput): BattleOutput {
  const rng = mulberry32(input.seed);
  const rounds = [];
  
  let attStr = input.attacker.strength;
  let attMorale = input.attacker.morale;
  
  let defStr = input.defender.strength;
  let defMorale = input.defender.morale;
  
  let round = 1;
  while (round <= 10 && attStr > 0 && attMorale > 0 && defStr > 0 && defMorale > 0) {
    const attPower = attStr 
      * counterMatrix[input.attacker.unitType][input.defender.unitType]
      * terrainModifiers[input.terrain][input.attacker.unitType]
      * formationModifiers[input.attacker.formation].attack
      * supplyFactor(input.attacker.supply)
      * moraleFactor(attMorale)
      * (input.attacker.factionId === "ravager" ? 1.1 : 1.0)
      * (input.attacker.factionId === "bastion" ? 0.95 : 1.0);
      
    const defPower = defStr 
      * counterMatrix[input.defender.unitType][input.attacker.unitType]
      * terrainModifiers[input.terrain][input.defender.unitType]
      * formationModifiers[input.defender.formation].defense
      * supplyFactor(input.defender.supply)
      * moraleFactor(defMorale)
      * (input.defender.factionId === "bastion" ? 1.15 : 1.0);
      
    const attDmg = Math.floor(attPower * (0.85 + rng() * 0.30) / 10);
    const defDmg = Math.floor(defPower * (0.85 + rng() * 0.30) / 10);
    
    attStr = Math.max(0, attStr - defDmg);
    defStr = Math.max(0, defStr - attDmg);
    
    attMorale = Math.max(0, attMorale - Math.ceil((defDmg / Math.max(1, input.attacker.strength)) * 20));
    defMorale = Math.max(0, defMorale - Math.ceil((attDmg / Math.max(1, input.defender.strength)) * 20));
    
    rounds.push({
      round,
      attackerDamage: attDmg,
      defenderDamage: defDmg,
      attackerStrength: attStr,
      defenderStrength: defStr
    });
    
    round++;
  }
  
  let victor: "attacker" | "defender" | "draw" = "draw";
  if (attStr > 0 && attMorale > 0 && (defStr === 0 || defMorale === 0)) victor = "attacker";
  else if (defStr > 0 && defMorale > 0 && (attStr === 0 || attMorale === 0)) victor = "defender";
  else if (attStr > 0 && defStr > 0) {
    // If we hit round 10 and both survive, tie-break by remaining strength percentage
    const attPct = attStr / input.attacker.strength;
    const defPct = defStr / input.defender.strength;
    if (attPct > defPct + 0.1) victor = "attacker";
    else if (defPct > attPct + 0.1) victor = "defender";
  }
  
  return {
    rounds,
    attacker: { strengthAfter: attStr, moraleAfter: attMorale },
    defender: { strengthAfter: defStr, moraleAfter: defMorale },
    victor
  };
}

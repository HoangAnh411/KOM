// Mission balance simulator — run from the repo root: node --import tsx scripts/balance-sim.mts
// Answers: can a legal new-player army win each chapter's missions, across
// compositions, stances and seeds? Player commander is the starter
// (logistics specialty, worst case — no attack bonus). The numbers in the
// makeOpponent comment in apps/server/src/progression.ts come from this sweep.
import { resolveMixedBattle } from "../apps/server/src/mixed-battle-engine.ts";
import type { ArmyComposition, BattleStance, CommanderSpecialty, TroopType, TerrainType } from "../packages/shared/src/index.ts";

type Squad = { troopType: TroopType; count: number };
const comp = (frontline: Squad, backline: Squad | null, flank: Squad | null): ArmyComposition => ({
  frontline: { id: "f", troopType: frontline.troopType, position: "frontline", count: frontline.count },
  backline: backline ? { id: "b", troopType: backline.troopType, position: "backline", count: backline.count } : null,
  flank: flank ? { id: "k", troopType: flank.troopType, position: "flank", count: flank.count } : null,
});

// Opponent as makeOpponent would build it for each chapter.
function opponent(chapter: 1 | 2 | 3): { composition: ArmyComposition; stance: BattleStance; specialty: CommanderSpecialty; level: number; terrain: TerrainType; label: string } {
  if (chapter === 1) return { composition: comp({ troopType: "shield_infantry", count: 20 }, { troopType: "archers", count: 10 }, null), stance: "balanced", specialty: "infantry", level: 2, terrain: "plains", label: "ch1 30" };
  if (chapter === 2) return { composition: comp({ troopType: "spearmen", count: 45 }, { troopType: "archers", count: 15 }, null), stance: "balanced", specialty: "cavalry", level: 3, terrain: "hills", label: "ch2 60" };
  return { composition: comp({ troopType: "shield_infantry", count: 35 }, { troopType: "archers", count: 15 }, { troopType: "cavalry", count: 15 }), stance: "defensive", specialty: "infantry", level: 4, terrain: "swamp", label: "ch3 65" };
}

// Player army at the capacity the commander legally has when the chapter unlocks.
function playerCompositions(total: number): Array<{ label: string; composition: ArmyComposition }> {
  const out: Array<{ label: string; composition: ArmyComposition }> = [];
  const push = (label: string, f: TroopType, fc: number, b: TroopType | null, bc: number, k: TroopType | null, kc: number) => {
    if (fc + bc + kc !== total) throw new Error(`bad comp ${label}`);
    out.push({ label, composition: comp({ troopType: f, count: fc }, b ? { troopType: b, count: bc } : null, k ? { troopType: k, count: kc } : null) });
  };
  if (total === 100) {
    push("100 inf", "shield_infantry", 100, null, 0, null, 0);
    push("70 inf/30 arc", "shield_infantry", 70, "archers", 30, null, 0);
    push("60 inf/25 arc/15 cav", "shield_infantry", 60, "archers", 25, "cavalry", 15);
    push("50 spear/50 arc", "spearmen", 50, "archers", 50, null, 0);
    push("60 spear/40 arc", "spearmen", 60, "archers", 40, null, 0);
  } else if (total === 150) {
    push("150 inf", "shield_infantry", 150, null, 0, null, 0);
    push("90 inf/60 arc", "shield_infantry", 90, "archers", 60, null, 0);
    push("80 inf/40 arc/30 cav", "shield_infantry", 80, "archers", 40, "cavalry", 30);
    push("90 spear/60 arc", "spearmen", 90, "archers", 60, null, 0);
  } else {
    push("200 inf", "shield_infantry", 200, null, 0, null, 0);
    push("120 inf/80 arc", "shield_infantry", 120, "archers", 80, null, 0);
    push("100 inf/50 arc/50 cav", "shield_infantry", 100, "archers", 50, "cavalry", 50);
    push("120 spear/80 arc", "spearmen", 120, "archers", 80, null, 0);
  }
  return out;
}

const stances: BattleStance[] = ["balanced", "raid", "defensive"];
const seeds = [1, 42, 12345, 777, 31337];
const terrains: TerrainType[] = ["plains", "hills", "forest", "swamp"];

// Candidate opponent sizes per chapter (the ch1/ch3 numbers are provisional —
// this sweep picks the size a legal army can actually annihilate in 10 rounds).
const candidates: Array<{ chapter: 1 | 2 | 3; playerTotal: number; composition: ArmyComposition; stance: BattleStance; specialty: CommanderSpecialty; level: number; label: string }> = [
  { chapter: 1, playerTotal: 100, composition: comp({ troopType: "shield_infantry", count: 14 }, { troopType: "archers", count: 6 }, null), stance: "balanced", specialty: "infantry", level: 2, label: "ch1 20 (14+6)" },
  { chapter: 1, playerTotal: 100, composition: comp({ troopType: "shield_infantry", count: 17 }, { troopType: "archers", count: 8 }, null), stance: "balanced", specialty: "infantry", level: 2, label: "ch1 25 (17+8)" },
  { chapter: 1, playerTotal: 100, composition: comp({ troopType: "shield_infantry", count: 20 }, { troopType: "archers", count: 10 }, null), stance: "balanced", specialty: "infantry", level: 2, label: "ch1 30 (20+10)" },
  { chapter: 2, playerTotal: 150, composition: comp({ troopType: "spearmen", count: 45 }, { troopType: "archers", count: 15 }, null), stance: "balanced", specialty: "cavalry", level: 3, label: "ch2 60 (45+15)" },
  { chapter: 3, playerTotal: 200, composition: comp({ troopType: "shield_infantry", count: 25 }, { troopType: "archers", count: 10 }, { troopType: "cavalry", count: 10 }), stance: "defensive", specialty: "infantry", level: 4, label: "ch3 45 (25+10+10)" },
  { chapter: 3, playerTotal: 200, composition: comp({ troopType: "shield_infantry", count: 30 }, { troopType: "archers", count: 10 }, { troopType: "cavalry", count: 10 }), stance: "defensive", specialty: "infantry", level: 4, label: "ch3 50 (30+10+10)" },
  { chapter: 3, playerTotal: 200, composition: comp({ troopType: "shield_infantry", count: 30 }, { troopType: "archers", count: 12 }, { troopType: "cavalry", count: 13 }), stance: "defensive", specialty: "infantry", level: 4, label: "ch3 55 (30+12+13)" },
  { chapter: 3, playerTotal: 200, composition: comp({ troopType: "shield_infantry", count: 35 }, { troopType: "archers", count: 15 }, { troopType: "cavalry", count: 15 }), stance: "defensive", specialty: "infantry", level: 4, label: "ch3 65 (35+15+15)" },
];

for (const cand of candidates) {
  let wins = 0, draws = 0, losses = 0, battles = 0;
  const lossesByComp = new Map<string, number>();
  for (const player of playerCompositions(cand.playerTotal)) {
    for (const stance of stances) {
      for (const terrain of terrains) {
        for (const seed of seeds) {
          const result = resolveMixedBattle({
            attacker: { composition: player.composition, commander: { specialty: "logistics", level: cand.chapter }, stance, morale: 100, supply: 100 },
            defender: { composition: cand.composition, commander: { specialty: cand.specialty, level: cand.level }, stance: cand.stance, morale: 100, supply: 100 },
            terrain,
            seed,
          });
          battles++;
          if (result.victor === "attacker") wins++;
          else if (result.victor === "draw") draws++;
          else { losses++; lossesByComp.set(player.label, (lossesByComp.get(player.label) ?? 0) + 1); }
        }
      }
    }
  }
  console.log(`${cand.label}: ${battles} battles → ${wins} wins, ${draws} draws, ${losses} losses (${Math.round((wins / battles) * 100)}% win)`);
  if (losses) console.log("  losses by comp:", [...lossesByComp.entries()].map(([k, v]) => `${k}=${v}`).join(", "));
}

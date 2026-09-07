// Throwaway check for the e2e sortie step: the test's 20-strong shield-infantry
// army (starter logistics commander, level 1, balanced) vs the chapter-1 opening
// NPC (17+8). How often does the army come back wiped? A wipe sends it into the
// 120s recovery trip home, which would block the rest of the test.
import { resolveMixedBattle } from "../apps/server/src/mixed-battle-engine.ts";
import type { ArmyComposition, BattleStance, CommanderSpecialty, TroopType, TerrainType } from "../packages/shared/src/index.ts";

type Squad = { troopType: TroopType; count: number };
const comp = (frontline: Squad, backline: Squad | null, flank: Squad | null): ArmyComposition => ({
  frontline: { id: "f", troopType: frontline.troopType, position: "frontline", count: frontline.count },
  backline: backline ? { id: "b", troopType: backline.troopType, position: "backline", count: backline.count } : null,
  flank: flank ? { id: "k", troopType: flank.troopType, position: "flank", count: flank.count } : null,
});

const player = { composition: comp({ troopType: "shield_infantry", count: 20 }, null, null), stance: "balanced" as BattleStance, specialty: "logistics" as CommanderSpecialty, level: 1 };
const npc = { composition: comp({ troopType: "shield_infantry", count: 17 }, { troopType: "archers", count: 8 }, null), stance: "balanced" as BattleStance, specialty: "infantry" as CommanderSpecialty, level: 2 };
const terrains: TerrainType[] = ["plains", "hills", "forest", "swamp"];

let wins = 0, draws = 0, losses = 0, wipes = 0, battles = 0;
for (let seed = 1; seed <= 200; seed++) {
  for (const terrain of terrains) {
    const result = resolveMixedBattle({
      attacker: { composition: player.composition, commander: { specialty: player.specialty, level: player.level }, stance: player.stance, morale: 100, supply: 100 },
      defender: { composition: npc.composition, commander: { specialty: npc.specialty, level: npc.level }, stance: npc.stance, morale: 100, supply: 100 },
      terrain,
      seed,
    });
    battles++;
    if (result.victor === "attacker") wins++;
    else if (result.victor === "draw") draws++;
    else losses++;
    const survivors = result.rounds[result.rounds.length - 1]!.attacker.reduce((sum, g) => sum + g.countAfter, 0);
    if (survivors === 0) wipes++;
  }
}
console.log(`${battles} battles → ${wins} wins, ${draws} draws, ${losses} losses, ${wipes} player wipes (${Math.round((wipes / battles) * 100)}% wipe)`);

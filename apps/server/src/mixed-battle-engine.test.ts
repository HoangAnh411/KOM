import test from "node:test";
import assert from "node:assert/strict";
import type { ArmyComposition } from "@kingdoms/shared";
import { resolveMixedBattle } from "./mixed-battle-engine.js";

const composition = (frontline: ArmyComposition["frontline"], backline: ArmyComposition["backline"] = null, flank: ArmyComposition["flank"] = null): ArmyComposition => ({ frontline, backline, flank });
const side = (value: ArmyComposition, specialty: "infantry" | "archer" | "cavalry" | "logistics", stance: "balanced" | "raid" | "defensive" = "balanced") => ({ composition: value, commander: { specialty, level: 1 }, stance, morale: 100, supply: 100 });

test("mixed battle is deterministic and applies damage simultaneously", () => {
  const input = {
    attacker: side(composition({ id: "a-front", troopType: "shield_infantry", position: "frontline", count: 100 }, { id: "a-back", troopType: "archers", position: "backline", count: 100 }), "archer"),
    defender: side(composition({ id: "d-front", troopType: "spearmen", position: "frontline", count: 100 }, null, { id: "d-flank", troopType: "cavalry", position: "flank", count: 100 }), "cavalry"),
    terrain: "plains" as const,
    seed: 42,
  };
  assert.deepEqual(resolveMixedBattle(input), resolveMixedBattle(input));
  const result = resolveMixedBattle(input);
  assert.ok(result.rounds.length > 0);
  assert.ok(result.rounds[0]!.attacker.every(group => group.countAfter >= 0));
  assert.ok(result.rounds[0]!.defender.every(group => group.countAfter >= 0));
});

test("spearmen on the enemy frontline block cavalry flank access to the backline", () => {
  const result = resolveMixedBattle({
    attacker: side(composition(null, null, { id: "a-flank", troopType: "cavalry", position: "flank", count: 500 }), "cavalry"),
    defender: side(composition({ id: "d-front", troopType: "spearmen", position: "frontline", count: 100 }, { id: "d-back", troopType: "archers", position: "backline", count: 100 }), "logistics"),
    terrain: "plains",
    seed: 7,
  });
  assert.ok(result.rounds[0]!.defender.find(group => group.squadId === "d-front")!.casualties > 0);
  assert.equal(result.rounds[0]!.defender.find(group => group.squadId === "d-back")!.casualties, 0);
});

test("cavalry can hit the backline after the spearmen frontline is gone", () => {
  const result = resolveMixedBattle({
    attacker: side(composition(null, null, { id: "a-flank", troopType: "cavalry", position: "flank", count: 500 }), "cavalry"),
    defender: side(composition({ id: "d-front", troopType: "spearmen", position: "frontline", count: 1 }, { id: "d-back", troopType: "archers", position: "backline", count: 100 }), "logistics"),
    terrain: "plains",
    seed: 8,
  });
  assert.ok(result.rounds.some(round => round.defender.find(group => group.squadId === "d-back")!.casualties > 0));
});

test("commander capacity follows the level curve", async () => {
  const { commanderCapacity } = await import("@kingdoms/shared");
  assert.deepEqual([1, 3, 5, 7, 9, 10].map(commanderCapacity), [100, 200, 300, 400, 500, 500]);
});

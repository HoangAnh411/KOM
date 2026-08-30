import test from "node:test";
import assert from "node:assert/strict";
import { resolveBattle, type BattleInput } from "./battle-engine.js";

test("battle engine is deterministic", () => {
  const input: BattleInput = {
    attacker: { unitType: "infantry", strength: 100, morale: 100, formation: "line", supply: 100, factionId: "meridian" },
    defender: { unitType: "archer", strength: 100, morale: 100, formation: "line", supply: 100, factionId: "bastion" },
    terrain: "plains",
    seed: 12345
  };
  
  const output1 = resolveBattle(input);
  const output2 = resolveBattle(input);
  
  assert.deepEqual(output1, output2);
  // Infantry counters archer, attacker should win
  assert.equal(output1.victor, "attacker");
});

test("terrain affects battle outcome", () => {
  const inputPlains: BattleInput = {
    attacker: { unitType: "cavalry", strength: 100, morale: 100, formation: "line", supply: 100, factionId: "meridian" },
    defender: { unitType: "infantry", strength: 100, morale: 100, formation: "line", supply: 100, factionId: "meridian" },
    terrain: "plains",
    seed: 1
  };
  
  const inputSwamp: BattleInput = { ...inputPlains, terrain: "swamp" };
  
  const plainsOut = resolveBattle(inputPlains);
  const swampOut = resolveBattle(inputSwamp);
  
  // Cavalry is worse in swamp (0.5x modifier) vs plains (1.2x modifier)
  assert.ok(plainsOut.attacker.strengthAfter > swampOut.attacker.strengthAfter);
});

test("low supply causes faster morale loss and lower attack power", () => {
  const inputNormal: BattleInput = {
    attacker: { unitType: "infantry", strength: 100, morale: 100, formation: "line", supply: 100, factionId: "meridian" },
    defender: { unitType: "infantry", strength: 100, morale: 100, formation: "line", supply: 100, factionId: "meridian" },
    terrain: "plains",
    seed: 42
  };
  
  const inputLowSupply: BattleInput = {
    ...inputNormal,
    attacker: { ...inputNormal.attacker, supply: 10 } // severely penalizes power
  };
  
  const normalOut = resolveBattle(inputNormal);
  const lowSupplyOut = resolveBattle(inputLowSupply);
  
  assert.ok(normalOut.attacker.strengthAfter > lowSupplyOut.attacker.strengthAfter);
});

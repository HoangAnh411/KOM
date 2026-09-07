import type { Army, ArmyComposition, ArmyPosition, Commander, FormationPreset, TroopCounts, TroopReserve, TroopType } from "@kingdoms/shared";
import { armyCompositionTotal, armyPositions, commanderCapacity, emptyTroopCounts, gameRules, troopTypes } from "@kingdoms/shared";
import { randomUUID } from "node:crypto";
import type { GameState } from "./types.js";
import { CommandRegistry } from "./command-registry.js";
import { releaseCommander, legacyUnitTypeOf } from "./army-model.js";

const activeOrder = (army: Army): boolean => Boolean(army.attackOrder || army.targetX !== undefined || army.targetY !== undefined);

function countsOf(composition: ArmyComposition | undefined): TroopCounts {
  const counts = emptyTroopCounts();
  for (const position of armyPositions) {
    const squad = composition?.[position];
    if (squad) counts[squad.troopType] += squad.count;
  }
  return counts;
}

function reserveFor(state: GameState, cityId: string, playerId: string): TroopReserve {
  const current = state.troopReserves[cityId];
  if (current) return current;
  const created: TroopReserve = { cityId, ownerPlayerId: playerId, available: emptyTroopCounts(), wounded: emptyTroopCounts() };
  state.troopReserves[cityId] = created;
  return created;
}

function commanderFor(state: GameState, army: Army, playerId: string): Commander {
  if (!army.commanderId) throw new Error("COMMANDER_REQUIRED");
  const commander = state.commanders.find(item => item.id === army.commanderId && item.ownerPlayerId === playerId);
  if (!commander) throw new Error("COMMANDER_NOT_FOUND");
  return commander;
}

function editableArmy(state: GameState, armyId: string, playerId: string): Army {
  const army = state.armies.find(item => item.id === armyId);
  if (!army || army.ownerPlayerId !== playerId) throw new Error("ARMY_ACCESS_DENIED");
  if (army.strength <= 0) throw new Error("ARMY_DESTROYED");
  if (activeOrder(army)) throw new Error("ARMY_IN_TRANSIT");
  if (army.homeCityId) {
    const city = state.cities.find(item => item.id === army.homeCityId && item.playerId === playerId);
    if (!city || army.x !== city.x || army.y !== city.y) throw new Error("ARMY_NOT_IN_HOME_CITY");
  }
  return army;
}

function compositionWithCounts(composition: ArmyComposition, counts: TroopCounts): ArmyComposition {
  // Squads draw from the pool sequentially: a troop type filling two positions
  // gets whatever the earlier position left, not the full amount again. Without
  // this, 40 frontline + 40 backline of one type "fits" into 40 available troops.
  const remaining: TroopCounts = { ...counts };
  const allocate = (squad: ArmyComposition["frontline"]): ArmyComposition["frontline"] => {
    if (!squad) return null;
    const count = Math.min(squad.count, Math.max(0, remaining[squad.troopType]));
    remaining[squad.troopType] -= count;
    return count > 0 ? { ...squad, count } : null;
  };
  return {
    frontline: allocate(composition.frontline),
    backline: allocate(composition.backline),
    flank: allocate(composition.flank),
  };
}

function legacyUnitType(composition: ArmyComposition): Army["unitType"] {
  return legacyUnitTypeOf(composition);
}

function cloneComposition(composition: ArmyComposition | undefined): ArmyComposition {
  return {
    frontline: composition?.frontline ? { ...composition.frontline } : null,
    backline: composition?.backline ? { ...composition.backline } : null,
    flank: composition?.flank ? { ...composition.flank } : null,
  };
}

function hasTechnology(state: GameState, playerId: string, technologyId: string): boolean {
  return state.technologyProgress[playerId]?.unlocked.includes(technologyId as never) ?? false;
}

export class ArmyManagementRepository {
  constructor(private readonly commands: CommandRegistry = new CommandRegistry()) {}

  assignCommander(commandId: string, armyId: string, commanderId: string, playerId: string, state: GameState): string {
    const army = editableArmy(state, armyId, playerId);
    const commander = state.commanders.find(item => item.id === commanderId && item.ownerPlayerId === playerId);
    if (!commander) throw new Error("COMMANDER_NOT_FOUND");
    if (commander.assignedArmyId && commander.assignedArmyId !== army.id) throw new Error("COMMANDER_ALREADY_ASSIGNED");
    // The swap must respect the incoming commander's capacity: an army over the
    // new limit has to send troops back to the reserve before changing leaders.
    const total = army.composition ? armyCompositionTotal(army.composition) : army.strength;
    if (total > commanderCapacity(commander.level)) throw new Error("ARMY_CAPACITY_EXCEEDED");
    const previous = state.commanders.find(item => item.assignedArmyId === army.id);
    if (!this.commands.claim(commandId)) return "already_processed";
    if (previous) previous.assignedArmyId = undefined;
    commander.assignedArmyId = army.id;
    army.commanderId = commander.id;
    return "accepted";
  }

  updateComposition(commandId: string, armyId: string, composition: ArmyComposition, stance: Army["stance"], playerId: string, state: GameState): string {
    const army = editableArmy(state, armyId, playerId);
    const commander = commanderFor(state, army, playerId);
    const total = armyCompositionTotal(composition);
    if (total > commanderCapacity(commander.level)) throw new Error("ARMY_CAPACITY_EXCEEDED");
    const cityId = army.homeCityId;
    if (!cityId) throw new Error("ARMY_HOME_CITY_REQUIRED");
    const reserve = reserveFor(state, cityId, playerId);
    const oldCounts = countsOf(army.composition);
    const newCounts = countsOf(composition);
    for (const troopType of troopTypes) {
      const available = reserve.available[troopType] + oldCounts[troopType];
      if (newCounts[troopType] > available) throw new Error("INSUFFICIENT_RESERVE");
    }
    if (!this.commands.claim(commandId)) return "already_processed";
    for (const troopType of troopTypes) reserve.available[troopType] = reserve.available[troopType] + oldCounts[troopType] - newCounts[troopType];
    army.composition = composition;
    army.stance = stance ?? "balanced";
    // Transitional mirror for legacy map/UI code. New combat reads composition.
    army.strength = total;
    return "accepted";
  }

  savePreset(commandId: string, name: string, composition: ArmyComposition, stance: NonNullable<Army["stance"]>, playerId: string, state: GameState): FormationPreset {
    if (state.formationPresets.filter(item => item.ownerPlayerId === playerId).length >= 5) throw new Error("FORMATION_PRESET_LIMIT");
    if (!this.commands.claim(commandId)) throw new Error("already_processed");
    const preset: FormationPreset = { id: `${playerId}-${commandId}`, ownerPlayerId: playerId, name, composition, stance };
    state.formationPresets.push(preset);
    return preset;
  }

  applyPreset(commandId: string, armyId: string, presetId: string, playerId: string, state: GameState): { status: "accepted"; missing: TroopCounts } {
    const army = editableArmy(state, armyId, playerId);
    const preset = state.formationPresets.find(item => item.id === presetId && item.ownerPlayerId === playerId);
    if (!preset) throw new Error("FORMATION_PRESET_NOT_FOUND");
    const commander = commanderFor(state, army, playerId);
    const cityId = army.homeCityId;
    if (!cityId) throw new Error("ARMY_HOME_CITY_REQUIRED");
    const reserve = reserveFor(state, cityId, playerId);
    const available = countsOf(army.composition);
    for (const troopType of troopTypes) available[troopType] += reserve.available[troopType];
    const requested = countsOf(preset.composition);
    const applied = emptyTroopCounts();
    const missing = emptyTroopCounts();
    for (const troopType of troopTypes) {
      applied[troopType] = Math.min(requested[troopType], available[troopType]);
      missing[troopType] = requested[troopType] - applied[troopType];
    }
    const composition = compositionWithCounts(preset.composition, applied);
    if (armyCompositionTotal(composition) > commanderCapacity(commander.level)) throw new Error("ARMY_CAPACITY_EXCEEDED");
    const oldCounts = countsOf(army.composition);
    const newCounts = countsOf(composition);
    for (const troopType of troopTypes) {
      if (newCounts[troopType] > oldCounts[troopType] + reserve.available[troopType]) throw new Error("INSUFFICIENT_RESERVE");
    }
    if (!this.commands.claim(commandId)) return { status: "accepted", missing: emptyTroopCounts() };
    for (const troopType of troopTypes) reserve.available[troopType] = reserve.available[troopType] + oldCounts[troopType] - newCounts[troopType];
    army.composition = composition;
    army.stance = preset.stance;
    army.strength = armyCompositionTotal(composition);
    return { status: "accepted", missing };
  }

  recruitReserve(commandId: string, cityId: string, troopType: TroopType, amount: number, playerId: string, state: GameState): string {
    const city = state.cities.find(item => item.id === cityId && item.playerId === playerId);
    if (!city) throw new Error("CITY_ACCESS_DENIED");
    if (city.frozen) throw new Error("ACCOUNT_BANNED");
    if ((city.buildings.barracks ?? 0) < 1) throw new Error("BUILDING_REQUIRED");
    // Same queue, same price, same duration as /api/commands/train — the only
    // difference is the command name. An instant grant here would make the
    // training queue's recruitment limit meaningless.
    return this.train(commandId, cityId, troopType, amount, playerId, state);
  }

  createArmy(commandId: string, cityId: string, commanderId: string, composition: ArmyComposition, stance: NonNullable<Army["stance"]>, playerId: string, state: GameState): Army {
    const city = state.cities.find(item => item.id === cityId && item.playerId === playerId);
    if (!city) throw new Error("CITY_ACCESS_DENIED");
    if (city.frozen) throw new Error("ACCOUNT_BANNED");
    if (state.armies.filter(item => item.ownerPlayerId === playerId).length >= 5) throw new Error("ARMY_CAP_REACHED");
    const commander = state.commanders.find(item => item.id === commanderId && item.ownerPlayerId === playerId);
    if (!commander) throw new Error("COMMANDER_NOT_FOUND");
    if (commander.assignedArmyId) throw new Error("COMMANDER_ALREADY_ASSIGNED");
    const total = armyCompositionTotal(composition);
    if (!total) throw new Error("ARMY_EMPTY");
    if (!composition.frontline) throw new Error("FRONTLINE_REQUIRED");
    if (total > commanderCapacity(commander.level)) throw new Error("ARMY_CAPACITY_EXCEEDED");
    const reserve = reserveFor(state, cityId, playerId);
    const requested = countsOf(composition);
    for (const troopType of troopTypes) if (requested[troopType] > reserve.available[troopType]) throw new Error("INSUFFICIENT_RESERVE");
    if (!this.commands.claim(commandId)) throw new Error("already_processed");
    for (const troopType of troopTypes) reserve.available[troopType] -= requested[troopType];
    const id = randomUUID();
    const army: Army = { id, ownerType: "player", ownerPlayerId: playerId, x: city.x, y: city.y, homeCityId: city.id, commanderId, composition, stance, unitType: legacyUnitType(composition), strength: total, morale: 100, formation: "line", supply: 100, wounded: emptyTroopCounts(), lastSupplyAt: new Date().toISOString() };
    commander.assignedArmyId = id;
    state.armies.push(army);
    return army;
  }

  reinforce(commandId: string, armyId: string, troopType: TroopType, amount: number, position: ArmyPosition, playerId: string, state: GameState): string {
    const army = editableArmy(state, armyId, playerId);
    if (!army.composition || !army.commanderId) throw new Error("ARMY_V2_REQUIRED");
    const commander = commanderFor(state, army, playerId);
    const reserve = reserveFor(state, army.homeCityId!, playerId);
    if (armyCompositionTotal(army.composition) + amount > commanderCapacity(commander.level)) throw new Error("ARMY_CAPACITY_EXCEEDED");
    if (reserve.available[troopType] < amount) throw new Error("INSUFFICIENT_RESERVE");
    const composition = cloneComposition(army.composition);
    const squad = composition[position];
    if (squad && squad.troopType !== troopType) throw new Error("POSITION_OCCUPIED");
    if (squad) squad.count += amount;
    else composition[position] = { id: `${army.id}-${position}-${troopType}`, troopType, position, count: amount };
    if (!this.commands.claim(commandId)) return "already_processed";
    reserve.available[troopType] -= amount;
    army.composition = composition;
    army.strength = armyCompositionTotal(composition);
    army.unitType = legacyUnitType(composition);
    return "accepted";
  }

  transfer(commandId: string, sourceArmyId: string, targetArmyId: string, troopType: TroopType, amount: number, sourcePosition: ArmyPosition, targetPosition: ArmyPosition, playerId: string, state: GameState): string {
    const source = editableArmy(state, sourceArmyId, playerId);
    const target = editableArmy(state, targetArmyId, playerId);
    if (source.id === target.id || source.homeCityId !== target.homeCityId || source.x !== target.x || source.y !== target.y) throw new Error("ARMIES_NOT_TOGETHER");
    if (!source.composition || !target.composition) throw new Error("ARMY_V2_REQUIRED");
    const targetCommander = commanderFor(state, target, playerId);
    if (armyCompositionTotal(target.composition) + amount > commanderCapacity(targetCommander.level)) throw new Error("ARMY_CAPACITY_EXCEEDED");
    const sourceComposition = cloneComposition(source.composition);
    const targetComposition = cloneComposition(target.composition);
    const from = sourceComposition[sourcePosition];
    if (!from || from.troopType !== troopType || from.count < amount) throw new Error("INSUFFICIENT_ARMY_TROOPS");
    const to = targetComposition[targetPosition];
    if (to && to.troopType !== troopType) throw new Error("POSITION_OCCUPIED");
    if (!this.commands.claim(commandId)) return "already_processed";
    if (from.count === amount) sourceComposition[sourcePosition] = null;
    else from.count -= amount;
    if (to) to.count += amount;
    else targetComposition[targetPosition] = { id: `${target.id}-${targetPosition}-${troopType}`, troopType, position: targetPosition, count: amount };
    source.composition = sourceComposition;
    target.composition = targetComposition;
    source.strength = armyCompositionTotal(sourceComposition);
    target.strength = armyCompositionTotal(targetComposition);
    source.unitType = legacyUnitType(sourceComposition);
    target.unitType = legacyUnitType(targetComposition);
    return "accepted";
  }

  returnHome(commandId: string, armyId: string, playerId: string, state: GameState): string {
    const army = state.armies.find(item => item.id === armyId && item.ownerPlayerId === playerId);
    if (!army) throw new Error("ARMY_ACCESS_DENIED");
    if (!army.homeCityId) throw new Error("ARMY_HOME_CITY_REQUIRED");
    const city = state.cities.find(item => item.id === army.homeCityId && item.playerId === playerId);
    if (!city) throw new Error("CITY_ACCESS_DENIED");
    if (!this.commands.claim(commandId)) return "already_processed";
    army.attackOrder = undefined;
    army.targetX = city.x;
    army.targetY = city.y;
    army.returningHome = true;
    return "accepted";
  }

  train(commandId: string, cityId: string, troopType: TroopType, amount: number, playerId: string, state: GameState): string {
    const city = state.cities.find(item => item.id === cityId && item.playerId === playerId);
    if (!city) throw new Error("CITY_ACCESS_DENIED");
    if ((city.buildings.barracks ?? 0) < 1) throw new Error("BUILDING_REQUIRED");
    const queue = state.trainingQueues[cityId] ?? (state.trainingQueues[cityId] = { cityId, items: [] });
    if (queue.items.length >= gameRules.training.queueLimit) throw new Error("TRAINING_QUEUE_FULL");
    const perTroop = gameRules.training.costPerTroop[troopType];
    const cost = { food: perTroop.food * amount, wood: perTroop.wood * amount, stone: perTroop.stone * amount, iron: perTroop.iron * amount };
    if (Object.keys(cost).some(resource => city.resources[resource as keyof typeof city.resources] < cost[resource as keyof typeof cost])) throw new Error("INSUFFICIENT_RESOURCES");
    if (!this.commands.claim(commandId)) return "already_processed";
    city.resources.food -= cost.food;
    city.resources.wood -= cost.wood;
    city.resources.stone -= cost.stone;
    city.resources.iron -= cost.iron;
    const startedAt = new Date().toISOString();
    queue.items.push({ id: `${playerId}-${commandId}`, cityId, troopType, amount, startedAt, completesAt: new Date(Date.now() + amount * gameRules.training.durationSecondsPerTroop * 1000).toISOString() });
    return "accepted";
  }

  heal(commandId: string, cityId: string, troopType: TroopType, amount: number, playerId: string, state: GameState): string {
    const city = state.cities.find(item => item.id === cityId && item.playerId === playerId);
    if (!city) throw new Error("CITY_ACCESS_DENIED");
    if ((city.buildings.hospital ?? 0) < 1) throw new Error("BUILDING_REQUIRED");
    const reserve = reserveFor(state, cityId, playerId);
    if (reserve.wounded[troopType] < amount) throw new Error("INSUFFICIENT_WOUNDED");
    const queue = state.hospitalQueues[cityId] ?? (state.hospitalQueues[cityId] = { cityId, items: [] });
    if (queue.items.length >= gameRules.training.queueLimit) throw new Error("HOSPITAL_QUEUE_FULL");
    const foodCost = amount * gameRules.hospital.foodPerTroop;
    if (city.resources.food < foodCost) throw new Error("INSUFFICIENT_RESOURCES");
    if (!this.commands.claim(commandId)) return "already_processed";
    city.resources.food -= foodCost;
    reserve.wounded[troopType] -= amount;
    const startedAt = new Date().toISOString();
    const medicineFactor = hasTechnology(state, playerId, "field_medicine") ? 0.75 : 1;
    queue.items.push({ id: `${playerId}-${commandId}`, cityId, troopType, amount, startedAt, completesAt: new Date(Date.now() + Math.max(1, Math.ceil(amount * gameRules.hospital.durationSecondsPerTroop * medicineFactor)) * 1000).toISOString(), foodCost });
    return "accepted";
  }

  tick(state: GameState, now = Date.now()): boolean {
    let changed = false;
    for (const city of state.cities) {
      if (city.frozen || state.players.find(player => player.id === city.playerId)?.status === "banned") continue;
      const parsedProductionAt = Date.parse(city.productionAt ?? "");
      const productionAt = Number.isFinite(parsedProductionAt) ? parsedProductionAt : now;
      const start = Math.max(productionAt, now - gameRules.production.catchUpLimitSeconds * 1000);
      const minutes = Math.floor((now - start) / 60_000);
      city.productionAt = new Date(start + minutes * 60_000).toISOString();
      if (!minutes) continue;
      const capacity = gameRules.production.warehouseBaseCapacity + (city.buildings.warehouse ?? 0) * gameRules.production.warehouseCapacityPerLevel;
      const cropFactor = hasTechnology(state, city.playerId, "crop_rotation") ? 1.2 : 1;
      const millFactor = hasTechnology(state, city.playerId, "sawmill_blades") ? 1.15 : 1;
      const produced: Partial<Record<keyof typeof city.resources, number>> = {
        food: Math.round(minutes * gameRules.production.perMinute.farm * (city.buildings.farm ?? 0) * cropFactor),
        wood: Math.round(minutes * gameRules.production.perMinute.lumber_mill * (city.buildings.lumber_mill ?? 0) * millFactor),
        stone: Math.round(minutes * gameRules.production.perMinute.stone_quarry * (city.buildings.stone_quarry ?? 0) * millFactor),
      };
      for (const resource of ["food", "wood", "stone", "iron"] as const) {
        const amount = produced[resource] ?? 0;
        if (amount > 0) city.resources[resource] = Math.min(capacity, city.resources[resource] + amount);
      }
      changed = true;
    }
    for (const [cityId, queue] of Object.entries(state.trainingQueues)) {
      const city = state.cities.find(item => item.id === cityId);
      if (!city || city.frozen) continue;
      for (const item of queue.items.filter(item => Date.parse(item.completesAt) <= now)) {
        const reserve = reserveFor(state, cityId, city.playerId);
        reserve.available[item.troopType] += item.amount;
        queue.items = queue.items.filter(candidate => candidate.id !== item.id);
        // Daily-quest evidence: one finished training batch (the hospital
        // queue below heals — it is not training and must not count).
        state.activityCounters.trainingBatches[city.playerId] = (state.activityCounters.trainingBatches[city.playerId] ?? 0) + 1;
        changed = true;
      }
    }
    for (const [cityId, queue] of Object.entries(state.hospitalQueues)) {
      const city = state.cities.find(item => item.id === cityId);
      if (!city || city.frozen) continue;
      for (const item of queue.items.filter(item => Date.parse(item.completesAt) <= now)) {
        const reserve = reserveFor(state, cityId, city.playerId);
        reserve.available[item.troopType] += item.amount;
        queue.items = queue.items.filter(candidate => candidate.id !== item.id);
        changed = true;
      }
    }
    for (const army of [...state.armies]) {
      // A destroyed army that reached home before its recovery timer expired no
      // longer carries `returningHome`, so the arrival branch below never sees
      // it again. Release the commander here once the timer actually passes;
      // an army still marching home keeps its wounded cargo until arrival.
      if (army.strength === 0 && army.recoveryAt && !army.returningHome && Date.parse(army.recoveryAt) <= now) {
        releaseCommander(state, army);
        state.armies = state.armies.filter(item => item.id !== army.id);
        changed = true;
        continue;
      }
      if (!army.returningHome || !army.homeCityId) continue;
      const city = state.cities.find(item => item.id === army.homeCityId && item.playerId === army.ownerPlayerId);
      if (!city || army.x !== city.x || army.y !== city.y) continue;
      const reserve = reserveFor(state, city.id, city.playerId);
      for (const troopType of troopTypes) reserve.wounded[troopType] += army.wounded?.[troopType] ?? 0;
      army.wounded = emptyTroopCounts();
      army.supply = 100;
      army.returningHome = false;
      if (army.strength === 0 && army.recoveryAt && Date.parse(army.recoveryAt) <= now) {
        releaseCommander(state, army);
        state.armies = state.armies.filter(item => item.id !== army.id);
      }
      changed = true;
    }
    for (const [playerId, queue] of Object.entries(state.researchQueues)) {
      const finished = queue.items.filter(item => Date.parse(item.completesAt) <= now);
      if (!finished.length) continue;
      const progress = state.technologyProgress[playerId] ??= { playerId, unlocked: [] };
      for (const item of finished) if (!progress.unlocked.includes(item.technologyId)) progress.unlocked.push(item.technologyId);
      queue.items = queue.items.filter(item => Date.parse(item.completesAt) > now);
      changed = true;
    }
    return changed;
  }
}

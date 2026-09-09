import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Army, AttackOrder, BattleReport, Formation, TerrainType, UnitType, FactionId, TroopCounts, MixedBattleReport, Commander, ArmyComposition } from "@kingdoms/shared";
import { armyCompositionTotal, armyPositions, commanderCapacity, emptyTroopCounts, recruitmentCost, terrainAt, troopTypes } from "@kingdoms/shared";
import type { GameState } from "./types.js";
import { CommandRegistry } from "./command-registry.js";
import { resolveBattle } from "./battle-engine.js";
import { resolveMixedBattle, allocateCasualties, type MixedBattleOutput, type MixedBattleSide } from "./mixed-battle-engine.js";
import { dropEmptySquads, legacyUnitTypeOf, releaseCommander, specialtyForUnit, troopTypeForUnit } from "./army-model.js";

export const battleReportMemoryLimit = 200;

/** What the ground is at a tile: the authored world, with `map_tiles` overrides on top. Every
 *  reader goes through this — a raw `state.terrainMap[key]` lookup would answer `undefined` for
 *  the 1296 tiles nobody has overridden, which is every tile today. */
export const terrainOf = (state: GameState, x: number, y: number): TerrainType =>
  state.terrainMap[`${x},${y}`] ?? terrainAt(x, y);

function assertActivePlayer(state: GameState, playerId: string): void { if (state.players.find(player => player.id === playerId)?.status === "banned") throw new Error("ACCOUNT_BANNED"); }
function assertActiveTarget(state: GameState, playerId: string | null | undefined, frozen?: boolean): void { if (frozen || (playerId && state.players.find(player => player.id === playerId)?.status === "banned")) throw new Error("TARGET_FROZEN"); }

export type AttackOrderCancellation = { orderId: string; armyId: string; targetArmyId: string; reason: "target_destroyed" | "target_frozen"; at: string };

export class CombatRepository {
  // Tick-resolved battles and auto-canceled pursuit orders, drained once per
  // tick by the store (ledger) and the HTTP layer (WebSocket broadcast).
  private reportsToBroadcast: BattleReport[] = [];
  private pendingCancellations: AttackOrderCancellation[] = [];

  drainReports(): BattleReport[] { const out = this.reportsToBroadcast; this.reportsToBroadcast = []; return out; }
  drainCancellations(): AttackOrderCancellation[] { const out = this.pendingCancellations; this.pendingCancellations = []; return out; }

  // No `capture()`/`restore()`: the only state this repository owned outside `GameState` was the
  // claimed-command Set, and that now lives in the shared `CommandRegistry`, which the store rolls
  // back once for every repository instead of copying three Sets twice per command.
  constructor(private readonly pool?: Pool, private readonly commands: CommandRegistry = new CommandRegistry()) {}

  /** There is no terrain to generate any more. This used to be three modulo expressions
   *  (`(x+y)%7`, `(x*y)%11`, `(x+y)%13`) painting diagonal stripes into all 400 tiles of
   *  `state.terrainMap`, which meant this file quietly owned the shape of the world. The world is
   *  now authored in `@kingdoms/shared` and read with `terrainAt()`, so `state.terrainMap` holds
   *  only the tiles that *differ* from it — `map_tiles` overrides, and nothing else.
   *
   *  Seeding is therefore a reset rather than a fill, and the reset is the point: a `game_state`
   *  row saved against the old striped world would otherwise come back as 400 overrides and paint
   *  those stripes across the middle of the new map. `load()` refills from `map_tiles`, which is
   *  the only thing allowed to put an override there. */
  seed(state: GameState): void {
    state.terrainMap = {};
  }

  async load(state: GameState): Promise<void> {
    this.seed(state);
    if (!this.pool) return;
    try {
      const terrainRes = await this.pool.query<{ x: number; y: number; terrain_type: string }>(
        `SELECT x, y, terrain_type FROM map_tiles WHERE kingdom_id = $1`, [state.kingdom.id]
      );
      // Only rows that disagree with the authored world are kept. A `map_tiles` row that merely
      // restates what `terrainAt()` already says is not an override, and storing it would put a
      // tile on the wire for no reason once the snapshot carries the differences.
      for (const row of terrainRes.rows) {
        const terrain = row.terrain_type as TerrainType;
        if (terrain !== terrainAt(row.x, row.y)) state.terrainMap[`${row.x},${row.y}`] = terrain;
      }
      
      const battleRes = await this.pool.query(
        `SELECT id, season_id, tile_x, tile_y, terrain, attacker_army_id, defender_army_id, victor, seed, rounds FROM battle_reports WHERE season_id = $1`, [state.season.id]
      );
      // Not loading full battle report payload to save memory, just a stub or we could if needed.
      // But let's assume we don't load historical reports into active state unless we want clients to see them.
      // For MVP, we'll keep them in state.battleReports.
      
      const statsRes = await this.pool.query(
        `SELECT player_id, victories, defeats, draws, strength_destroyed, strength_lost, tiles_controlled, successful_defenses FROM military_throughput WHERE season_id = $1`, [state.season.id]
      );
      for (const row of statsRes.rows) {
        state.militaryThroughput[row.player_id] = {
          victories: row.victories, defeats: row.defeats, draws: row.draws,
          strengthDestroyed: row.strength_destroyed, strengthLost: row.strength_lost,
          tilesControlled: row.tiles_controlled, successfulDefenses: row.successful_defenses
        };
      }
    } catch (error) { console.warn("combat load skipped", error instanceof Error ? error.message : error); }
  }

  async persist(client: PoolClient, state: GameState): Promise<void> {
    await client.query("DELETE FROM armies WHERE kingdom_id = $1 AND NOT (id = ANY($2::uuid[]))", [state.kingdom.id, state.armies.map(army => army.id)]);
    for (const army of state.armies) {
      await client.query(
        `INSERT INTO armies (id, player_id, kingdom_id, x, y, unit_type, strength, morale, formation, target_x, target_y, supply, owner_type, npc_kind, source_world_event_id, next_action_at, target_army_id, attack_order_id, attack_seed, attack_issued_at, last_supply_at, frozen, frozen_at, commander_id, composition, stance, home_city_id, wounded, recovery_at, returning_home)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
         ON CONFLICT (id) DO UPDATE SET player_id=EXCLUDED.player_id, x=EXCLUDED.x, y=EXCLUDED.y, strength=EXCLUDED.strength, morale=EXCLUDED.morale, formation=EXCLUDED.formation, target_x=EXCLUDED.target_x, target_y=EXCLUDED.target_y, supply=EXCLUDED.supply, owner_type=EXCLUDED.owner_type, npc_kind=EXCLUDED.npc_kind, source_world_event_id=EXCLUDED.source_world_event_id, next_action_at=EXCLUDED.next_action_at, target_army_id=EXCLUDED.target_army_id, attack_order_id=EXCLUDED.attack_order_id, attack_seed=EXCLUDED.attack_seed, attack_issued_at=EXCLUDED.attack_issued_at, last_supply_at=EXCLUDED.last_supply_at, frozen=EXCLUDED.frozen, frozen_at=EXCLUDED.frozen_at, commander_id=EXCLUDED.commander_id, composition=EXCLUDED.composition, stance=EXCLUDED.stance, home_city_id=EXCLUDED.home_city_id, wounded=EXCLUDED.wounded, recovery_at=EXCLUDED.recovery_at, returning_home=EXCLUDED.returning_home`,
        [army.id, army.ownerPlayerId, state.kingdom.id, army.x, army.y, army.unitType, army.strength, army.morale, army.formation, army.targetX ?? null, army.targetY ?? null, army.supply, army.ownerType, army.npcKind ?? null, army.sourceWorldEventId ?? null, army.nextActionAt ?? null, army.attackOrder?.targetArmyId ?? null, army.attackOrder?.id ?? null, army.attackOrder?.seed ?? null, army.attackOrder?.issuedAt ?? null, army.lastSupplyAt ?? null, army.frozen ?? false, army.frozenAt ?? null, army.commanderId ?? null, army.composition ? JSON.stringify(army.composition) : null, army.stance ?? null, army.homeCityId ?? null, JSON.stringify(army.wounded ?? emptyTroopCounts()), army.recoveryAt ?? null, army.returningHome ?? false]
      );
    }
    
    // We only insert new battle reports, assuming they are appended.
    // In a real system, we'd use an outbox or only insert those generated this tick.
    for (const report of state.battleReports) {
      await client.query(
        `INSERT INTO battle_reports (id, kingdom_id, season_id, attacker_id, defender_id, attacker_army_id, defender_army_id, tile_x, tile_y, terrain, victor, seed, rounds, result) 
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
        [report.id, report.kingdomId, report.seasonId, report.attacker.playerId, report.defender.playerId, report.attacker.armyId, report.defender.armyId, report.tileX, report.tileY, report.terrain, report.victor, report.seed, JSON.stringify(report.rounds), JSON.stringify(report)]
      );
    }
    
    for (const [playerId, stats] of Object.entries(state.militaryThroughput)) {
      await client.query(
        `INSERT INTO military_throughput (season_id, player_id, victories, defeats, draws, strength_destroyed, strength_lost, tiles_controlled, successful_defenses)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (season_id, player_id) DO UPDATE SET victories=EXCLUDED.victories, defeats=EXCLUDED.defeats, draws=EXCLUDED.draws, strength_destroyed=EXCLUDED.strength_destroyed, strength_lost=EXCLUDED.strength_lost, tiles_controlled=EXCLUDED.tiles_controlled, successful_defenses=EXCLUDED.successful_defenses`,
        [state.season.id, playerId, stats.victories, stats.defeats, stats.draws, stats.strengthDestroyed, stats.strengthLost, stats.tilesControlled, stats.successfulDefenses]
      );
    }
  }

  private claim(commandId: string): boolean {
    return this.commands.claim(commandId);
  }

  recruit(commandId: string, cityId: string, unitType: UnitType, amount: number, playerId: string, state: GameState): Army {
    assertActivePlayer(state, playerId);
    const city = state.cities.find(item => item.id === cityId);
    if (!city || city.playerId !== playerId) throw new Error("CITY_ACCESS_DENIED");
    if ((city.buildings.barracks ?? 0) < 1) throw new Error("BUILDING_REQUIRED");
    
    const cost = recruitmentCost(unitType, amount);
    if (city.resources.wood < cost.wood || city.resources.stone < cost.stone || city.resources.iron < cost.iron) {
      throw new Error("INSUFFICIENT_RESOURCES");
    }

    const playerArmies = state.armies.filter(a => a.ownerPlayerId === playerId);
    if (playerArmies.length >= 5) throw new Error("ARMY_CAP_REACHED");

    if (!this.claim(commandId)) throw new Error("already_processed");

    city.resources.wood -= cost.wood;
    city.resources.stone -= cost.stone;
    city.resources.iron -= cost.iron;
    
    const army: Army = {
      id: randomUUID(),
      ownerType: "player",
      ownerPlayerId: playerId,
      x: city.x,
      y: city.y,
      unitType,
      strength: amount,
      morale: 100,
      formation: "line",
      supply: 100,
      lastSupplyAt: new Date().toISOString()
    };
    state.armies.push(army);
    return army;
  }

  moveArmy(commandId: string, armyId: string, targetX: number, targetY: number, playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    const army = state.armies.find(a => a.id === armyId);
    if (!army || army.ownerPlayerId !== playerId) throw new Error("ARMY_ACCESS_DENIED");
    if (army.deployedOperationId) throw new Error("ARMY_DEPLOYED_OPERATION");
    if (army.strength <= 0) throw new Error("ARMY_DESTROYED");
    if (!this.claim(commandId)) return "already_processed";

    // A manual move supersedes any pursuit order.
    army.attackOrder = undefined;
    army.returningHome = undefined;
    army.targetX = targetX;
    army.targetY = targetY;
    return "accepted";
  }

  setFormation(commandId: string, armyId: string, formation: Formation, playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    const army = state.armies.find(a => a.id === armyId);
    if (!army || army.ownerPlayerId !== playerId) throw new Error("ARMY_ACCESS_DENIED");
    if (!this.claim(commandId)) return "already_processed";
    army.formation = formation;
    return "accepted";
  }

  mergeArmies(commandId: string, sourceId: string, targetId: string, playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    const source = state.armies.find(a => a.id === sourceId);
    const target = state.armies.find(a => a.id === targetId);
    if (!source || !target || source.ownerPlayerId !== playerId || target.ownerPlayerId !== playerId) throw new Error("ARMY_ACCESS_DENIED");
    if (source.deployedOperationId || target.deployedOperationId) throw new Error("ARMY_DEPLOYED_OPERATION");
    if (source.x !== target.x || source.y !== target.y) throw new Error("NOT_ON_SAME_TILE");
    if (source.composition && target.composition) return this.mergeCompositions(commandId, source, target, state);
    if (source.unitType !== target.unitType) throw new Error("UNIT_TYPE_MISMATCH");
    if (target.strength >= 500) throw new Error("TARGET_ARMY_FULL");

    if (!this.claim(commandId)) return "already_processed";

    const transfer = Math.min(source.strength, 500 - target.strength);
    source.strength -= transfer;
    target.strength += transfer;

    if (source.strength === 0) {
      releaseCommander(state, source);
      state.armies = state.armies.filter(a => a.id !== sourceId);
    }

    return "accepted";
  }

  /** Composition armies merge squad by squad, troop type into matching position,
   *  bounded by the target commander's capacity instead of the flat 500. This is
   *  the group-model path: strength alone must never move without the squads. */
  private mergeCompositions(commandId: string, source: Army, target: Army, state: GameState): string {
    const targetCommander = target.commanderId ? state.commanders.find(item => item.id === target.commanderId) : undefined;
    const capacity = targetCommander ? commanderCapacity(targetCommander.level) : 500;
    let room = capacity - armyCompositionTotal(target.composition!);
    if (room <= 0) throw new Error("TARGET_ARMY_FULL");

    if (!this.claim(commandId)) return "already_processed";

    const sourceComposition: ArmyComposition = {
      frontline: source.composition!.frontline ? { ...source.composition!.frontline } : null,
      backline: source.composition!.backline ? { ...source.composition!.backline } : null,
      flank: source.composition!.flank ? { ...source.composition!.flank } : null,
    };
    const targetComposition: ArmyComposition = {
      frontline: target.composition!.frontline ? { ...target.composition!.frontline } : null,
      backline: target.composition!.backline ? { ...target.composition!.backline } : null,
      flank: target.composition!.flank ? { ...target.composition!.flank } : null,
    };
    for (const position of armyPositions) {
      const squad = sourceComposition[position];
      if (!squad || squad.count <= 0 || room <= 0) continue;
      const move = Math.min(squad.count, room);
      const slot = armyPositions.find(candidate => targetComposition[candidate]?.troopType === squad.troopType) ?? armyPositions.find(candidate => !targetComposition[candidate]);
      if (!slot) break; // every position holds a different troop type; the rest stays put
      const existing = targetComposition[slot];
      if (existing) existing.count += move;
      else targetComposition[slot] = { id: `${target.id}-${slot}-${squad.troopType}`, troopType: squad.troopType, position: slot, count: move };
      squad.count -= move;
      room -= move;
    }
    source.composition = dropEmptySquads(sourceComposition);
    target.composition = dropEmptySquads(targetComposition);
    source.strength = armyCompositionTotal(source.composition);
    target.strength = armyCompositionTotal(target.composition);
    source.unitType = legacyUnitTypeOf(source.composition);
    target.unitType = legacyUnitTypeOf(target.composition);
    if (source.strength === 0) {
      releaseCommander(state, source);
      state.armies = state.armies.filter(a => a.id !== source.id);
    }
    return "accepted";
  }

  attack(commandId: string, attackerArmyId: string, defenderArmyId: string, playerId: string, state: GameState, diplomacy?: any): BattleReport | { pursuit: AttackOrder } {
    assertActivePlayer(state, playerId);
    const attacker = state.armies.find(a => a.id === attackerArmyId);
    const defender = state.armies.find(a => a.id === defenderArmyId);

    if (!attacker || attacker.ownerPlayerId !== playerId) throw new Error("ARMY_ACCESS_DENIED");
    if (attacker.deployedOperationId) throw new Error("ARMY_DEPLOYED_OPERATION");
    if (!defender) throw new Error("TARGET_NOT_FOUND");
    assertActiveTarget(state, defender.ownerPlayerId, defender.frozen);
    if (attacker.ownerPlayerId === defender.ownerPlayerId) throw new Error("INVALID_TARGET");
    if (attacker.strength <= 0 || defender.strength <= 0) throw new Error("ARMY_DESTROYED");

    if (!this.claim(commandId)) throw new Error("already_processed");

    const seed = Array.from(commandId).reduce((val, char) => (val * 31 + char.charCodeAt(0)) >>> 0, 7);
    if (attacker.x === defender.x && attacker.y === defender.y) {
      // Immediate resolution: the HTTP layer broadcasts this report via onCommitted.
      return this.resolveEncounter(attacker, defender, seed, state, diplomacy, commandId, false);
    }
    // Different tile: validate now, resolve the chase later on the same tile
    // with the original seed. One order per army — a new attack replaces it.
    const order: AttackOrder = { id: commandId, armyId: attacker.id, targetArmyId: defender.id, seed, targetX: defender.x, targetY: defender.y, issuedAt: new Date().toISOString() };
    attacker.attackOrder = order;
    attacker.targetX = defender.x;
    attacker.targetY = defender.y;
    return { pursuit: order };
  }

  cancelArmyOrder(commandId: string, armyId: string, playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    const army = state.armies.find(a => a.id === armyId);
    if (!army || army.ownerPlayerId !== playerId) throw new Error("ARMY_ACCESS_DENIED");
    // Covers both a pursuit order and a manual move: an issued order is
    // cancelable regardless of which kind created it.
    if (!army.attackOrder && army.targetX === undefined && army.targetY === undefined) throw new Error("NO_ATTACK_ORDER");
    if (!this.claim(commandId)) return "already_processed";
    army.attackOrder = undefined;
    army.targetX = undefined;
    army.targetY = undefined;
    return "accepted";
  }

  resolveEncounter(attacker: Army, defender: Army, seed: number, state: GameState, diplomacy?: any, commandId?: string, broadcast = true, terrainOverride?: TerrainType): BattleReport {
    const attackerPlayer = attacker.ownerPlayerId ? state.players.find(p => p.id === attacker.ownerPlayerId) : undefined;
    const defenderPlayer = defender.ownerPlayerId ? state.players.find(p => p.id === defender.ownerPlayerId) : undefined;
    const terrain = terrainOverride ?? terrainOf(state, attacker.x, attacker.y);
    const input = {
      attacker: { unitType: attacker.unitType, strength: attacker.strength, morale: attacker.morale, formation: attacker.formation, supply: attacker.supply, factionId: attackerPlayer?.factionId ?? "ravager" as FactionId },
      defender: { unitType: defender.unitType, strength: defender.strength, morale: defender.morale, formation: defender.formation, supply: defender.supply, factionId: defenderPlayer?.factionId ?? "ravager" as FactionId },
      terrain,
      seed
    };
    
      if (diplomacy && commandId && attacker.ownerPlayerId && defender.ownerPlayerId) {
        const violation = diplomacy.checkAttackViolation(attacker.ownerPlayerId, defender.ownerPlayerId, state);
        if (violation) diplomacy.breakTreaty(commandId + "-violate", violation.id, attacker.ownerPlayerId, state);
      }
    let mixedOutput: MixedBattleOutput | undefined;
    let output: { rounds: Array<{ round: number; attackerDamage: number; defenderDamage: number; attackerStrength: number; defenderStrength: number }>; attacker: { strengthAfter: number; moraleAfter: number }; defender: { strengthAfter: number; moraleAfter: number }; victor: "attacker" | "defender" | "draw" };
    const attackerCommander = attacker.commanderId ? state.commanders.find(commander => commander.id === attacker.commanderId) : undefined;
    const defenderCommander = defender.commanderId ? state.commanders.find(commander => commander.id === defender.commanderId) : undefined;
    const attackerReady = Boolean(attacker.composition && attacker.stance && attackerCommander);
    const defenderReady = Boolean(defender.composition && defender.stance && defenderCommander);
    // A battle resolves through the mixed engine whenever either side carries
    // composition data; a pre-composition army is presented as a single squad
    // of its legacy unit type, so it can no longer push the other side's
    // strength out of sync with its composition. The strength-only resolver
    // survives only for two pre-composition armies, where neither side has a
    // composition to drift from.
    const sideOf = (army: Army, ready: boolean, commander?: Commander): MixedBattleSide => {
      const composition: ArmyComposition = ready || army.composition
        ? army.composition!
        : { frontline: { id: `${army.id}-legacy-frontline`, troopType: troopTypeForUnit(army.unitType), position: "frontline", count: army.strength }, backline: null, flank: null };
      return {
        composition,
        commander: ready ? commander! : commander ?? { specialty: specialtyForUnit(army.unitType), level: 1 },
        stance: army.stance ?? "balanced",
        morale: army.morale,
        supply: army.supply,
        factionId: army.ownerPlayerId ? state.players.find(player => player.id === army.ownerPlayerId)?.factionId ?? "ravager" : "ravager",
      };
    };
    if (attackerReady || defenderReady) {
      // Composition is the source of truth. A strength that disagrees with it
      // (legacy save, pre-fix attrition) is repaired here rather than routed to
      // the old resolver, which would resurrect the drifted troops next battle.
      if (attackerReady) attacker.strength = armyCompositionTotal(attacker.composition!);
      if (defenderReady) defender.strength = armyCompositionTotal(defender.composition!);
      mixedOutput = resolveMixedBattle({
        attacker: sideOf(attacker, attackerReady, attackerCommander),
        defender: sideOf(defender, defenderReady, defenderCommander),
        terrain,
        seed,
      });
      output = {
        rounds: mixedOutput.rounds.map(round => ({
          round: round.round,
          attackerDamage: round.defender.reduce((sum, group) => sum + group.casualties, 0),
          defenderDamage: round.attacker.reduce((sum, group) => sum + group.casualties, 0),
          attackerStrength: round.attacker.reduce((sum, group) => sum + group.countAfter, 0),
          defenderStrength: round.defender.reduce((sum, group) => sum + group.countAfter, 0),
        })),
        attacker: { strengthAfter: mixedOutput.attacker.totalAfter, moraleAfter: mixedOutput.attacker.moraleAfter },
        defender: { strengthAfter: mixedOutput.defender.totalAfter, moraleAfter: mixedOutput.defender.moraleAfter },
        victor: mixedOutput.victor,
      };
    } else {
      output = resolveBattle(input);
    }
    
    const report: BattleReport = {
      id: randomUUID(),
      kingdomId: state.kingdom.id,
      seasonId: state.season.id,
      tileX: attacker.x,
      tileY: attacker.y,
      terrain,
      attacker: {
        ownerType: attacker.ownerType,
        playerId: attacker.ownerPlayerId,
        armyId: attacker.id,
        npcKind: attacker.npcKind,
        unitType: attacker.unitType,
        formation: attacker.formation,
        strengthBefore: attacker.strength,
        strengthAfter: output.attacker.strengthAfter,
        moraleBefore: attacker.morale,
        moraleAfter: output.attacker.moraleAfter,
        supplyBefore: attacker.supply
      },
      defender: {
        ownerType: defender.ownerType,
        playerId: defender.ownerPlayerId,
        armyId: defender.id,
        npcKind: defender.npcKind,
        unitType: defender.unitType,
        formation: defender.formation,
        strengthBefore: defender.strength,
        strengthAfter: output.defender.strengthAfter,
        moraleBefore: defender.morale,
        moraleAfter: output.defender.moraleAfter,
        supplyBefore: defender.supply
      },
      rounds: output.rounds,
      victor: output.victor,
      seed,
      resolvedAt: new Date().toISOString()
    };

    if (mixedOutput && attackerReady && defenderReady) {
      // One allocation for everything: the report's killed/wounded and the
      // army's wounded cargo both read allocateCasualties, per troop type.
      const sideReport = (army: Army, commander: Commander, before: number, after: number, side: "attacker" | "defender"): MixedBattleReport["attacker"] => {
        const allocation = allocateCasualties(mixedOutput.rounds, side);
        const killed = troopTypes.reduce((sum, troopType) => sum + allocation[troopType].killed, 0);
        const wounded = troopTypes.reduce((sum, troopType) => sum + allocation[troopType].wounded, 0);
        return { commanderId: commander.id, commanderSpecialty: commander.specialty, commanderLevel: commander.level, stance: army.stance!, composition: army.composition!, totalBefore: before, totalAfter: after, killed, wounded };
      };
      report.mixed = {
        rulesVersion: 1,
        attacker: sideReport(attacker, attackerCommander!, armyCompositionTotal(attacker.composition!), mixedOutput.attacker.totalAfter, "attacker"),
        defender: sideReport(defender, defenderCommander!, armyCompositionTotal(defender.composition!), mixedOutput.defender.totalAfter, "defender"),
        rounds: mixedOutput.rounds,
      };
    }
    
    // Apply damage
    attacker.strength = output.attacker.strengthAfter;
    attacker.morale = output.attacker.moraleAfter;
    defender.strength = output.defender.strengthAfter;
    defender.morale = output.defender.moraleAfter;
    if (mixedOutput) {
      // Only an army that already carries a composition gets one written back;
      // a pre-composition army keeps the strength-only model it fought with.
      const applyComposition = (army: Army, result: MixedBattleOutput["attacker"]): void => {
        if (!army.composition) return;
        army.composition = dropEmptySquads(result.composition);
        army.unitType = legacyUnitTypeOf(army.composition);
      };
      applyComposition(attacker, mixedOutput.attacker);
      applyComposition(defender, mixedOutput.defender);
      // Any player army that fought with a composition carries its wounded —
      // PvP included. The report shows the same split, so what the player
      // reads is what the hospital can later heal.
      if (attacker.ownerType === "player" && attacker.composition) this.recordWounded(attacker, "attacker", mixedOutput.rounds);
      if (defender.ownerType === "player" && defender.composition) this.recordWounded(defender, "defender", mixedOutput.rounds);
      this.awardPvEXp(attacker, defender, output.victor, state);
    }
    
    // Update stats
    const attStats = attackerPlayer ? (state.militaryThroughput[attackerPlayer.id] ??= { victories: 0, defeats: 0, draws: 0, strengthDestroyed: 0, strengthLost: 0, tilesControlled: 0, successfulDefenses: 0 }) : undefined;
    const defStats = defenderPlayer ? (state.militaryThroughput[defenderPlayer.id] ??= { victories: 0, defeats: 0, draws: 0, strengthDestroyed: 0, strengthLost: 0, tilesControlled: 0, successfulDefenses: 0 }) : undefined;
    
    const attLost = report.attacker.strengthBefore - report.attacker.strengthAfter;
    const defLost = report.defender.strengthBefore - report.defender.strengthAfter;
    
    if (attStats) { attStats.strengthLost += attLost; attStats.strengthDestroyed += defLost; }
    if (defStats) { defStats.strengthLost += defLost; defStats.strengthDestroyed += attLost; }
    
    if (output.victor === "attacker") {
      if (attStats) attStats.victories++;
      if (defStats) defStats.defeats++;
    } else if (output.victor === "defender") {
      if (defStats) { defStats.victories++; defStats.successfulDefenses++; }
      if (attStats) attStats.defeats++;
    } else {
      if (attStats) attStats.draws++;
      if (defStats) defStats.draws++;
    }
    
    state.battleReports.push(report);
    if (state.battleReports.length > battleReportMemoryLimit) state.battleReports.splice(0, state.battleReports.length - battleReportMemoryLimit);
    if (broadcast) this.reportsToBroadcast.push(report);

    // Clean up destroyed armies
    const keepForRecovery = (army: Army, opponent: Army) => mixedOutput && army.ownerType === "player" && opponent.ownerType === "npc" && army.strength === 0 && Boolean(army.homeCityId);
    // Every branch that removes an army releases its commander, PvP included —
    // otherwise the commander stays assigned to a nonexistent army forever.
    const destroy = (army: Army): void => {
      releaseCommander(state, army);
      state.armies = state.armies.filter(a => a.id !== army.id);
    };
    if (attacker.strength === 0 && !keepForRecovery(attacker, defender)) destroy(attacker);
    if (defender.strength === 0 && !keepForRecovery(defender, attacker)) destroy(defender);
    for (const [army, opponent] of [[attacker, defender], [defender, attacker]] as const) {
      if (keepForRecovery(army, opponent)) {
        army.recoveryAt = new Date(Date.now() + 120_000).toISOString();
        army.returningHome = true;
        const home = state.cities.find(city => city.id === army.homeCityId);
        if (home) { army.targetX = home.x; army.targetY = home.y; }
      }
    }

    return report;
  }

  private recordWounded(army: Army, side: "attacker" | "defender", rounds: MixedBattleOutput["rounds"]): void {
    // Same per-troop-type allocation the battle report shows (see
    // allocateCasualties) — the report and the recoverable cargo can't drift.
    const allocation = allocateCasualties(rounds, side);
    const wounded = { ...emptyTroopCounts(), ...(army.wounded ?? {}) };
    for (const troopType of troopTypes) wounded[troopType] += allocation[troopType].wounded;
    army.wounded = wounded;
  }

  private awardPvEXp(attacker: Army, defender: Army, victor: "attacker" | "defender" | "draw", state: GameState): void {
    if (victor === "draw") return;
    const winner = victor === "attacker" ? attacker : defender;
    const loser = victor === "attacker" ? defender : attacker;
    // XP chỉ đến từ đánh NPC (mission/world). PvP không cấp — hai tài khoản
    // của cùng người sẽ farm XP cho nhau vô hạn nếu được tính.
    if (winner.ownerType !== "player" || loser.ownerType !== "npc" || !winner.commanderId) return;
    const commander = state.commanders.find(item => item.id === winner.commanderId);
    if (!commander || commander.level >= 10) return;
    commander.xp += 25;
    while (commander.level < 10 && commander.xp >= commander.level * 100) {
      commander.xp -= commander.level * 100;
      commander.level += 1;
    }
  }

  tick(state: GameState, diplomacy?: any): boolean {
    let changed = false;
    for (const army of state.armies) {
      if (army.frozen || (army.ownerPlayerId && state.players.find(player => player.id === army.ownerPlayerId)?.status === "banned")) continue;
      if (army.strength <= 0 && !army.recoveryAt) continue;

      // Morale recovery (slowly regains up to 100 if supplied)
      if (army.supply >= 50 && army.morale < 100) {
        army.morale = Math.min(100, army.morale + 2);
        changed = true;
      }

      // Pursuit: chase the target's live position each tick; a dead, vanished
      // or frozen target cancels the order (banned armies pause because the
      // loop above skips them and resume unchanged after unban).
      if (army.attackOrder) {
        const order = army.attackOrder;
        const target = state.armies.find(army => army.id === order.targetArmyId);
        const targetGone = !target || target.strength <= 0;
        const targetFrozen = target ? target.frozen || Boolean(target.ownerPlayerId && state.players.find(player => player.id === target.ownerPlayerId)?.status === "banned") : false;
        if (targetGone || targetFrozen) {
          const reason = targetGone ? "target_destroyed" : "target_frozen";
          army.attackOrder = undefined;
          army.targetX = undefined;
          army.targetY = undefined;
          this.pendingCancellations.push({ orderId: order.id, armyId: army.id, targetArmyId: order.targetArmyId, reason, at: new Date().toISOString() });
          changed = true;
        } else {
          order.targetX = target.x;
          order.targetY = target.y;
          if (army.x !== target.x || army.y !== target.y) {
            army.targetX = target.x;
            army.targetY = target.y;
          }
        }
      }

      // Movement
      if (army.targetX !== undefined && army.targetY !== undefined) {
        if (army.x !== army.targetX || army.y !== army.targetY) {
          const roadEngineering = army.ownerPlayerId ? state.technologyProgress[army.ownerPlayerId]?.unlocked.includes("road_engineering") : false;
          const speed = (army.unitType === "cavalry" ? 2 : 1) + (roadEngineering ? 1 : 0);
          for (let step = 0; step < speed; step++) {
            if (army.x !== army.targetX) army.x += army.x < army.targetX ? 1 : -1;
            else if (army.y !== army.targetY) army.y += army.y < army.targetY ? 1 : -1;

            if (army.x === army.targetX && army.y === army.targetY) {
              army.targetX = undefined;
              army.targetY = undefined;
              break;
            }
          }
          changed = true;
        } else {
          army.targetX = undefined;
          army.targetY = undefined;
        }
      }

      // Same tile: resolve the chase with the order's original seed and
      // re-check treaties at actual combat (not at order issue time).
      if (army.attackOrder) {
        const order = army.attackOrder;
        const target = state.armies.find(army => army.id === order.targetArmyId);
        if (target && army.x === target.x && army.y === target.y) {
          army.attackOrder = undefined;
          army.targetX = undefined;
          army.targetY = undefined;
          this.resolveEncounter(army, target, order.seed, state, diplomacy, order.id);
          changed = true;
        }
      }
    }
    return changed;
  }
}



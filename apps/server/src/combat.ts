import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Army, AttackOrder, BattleReport, Formation, TerrainType, UnitType, FactionId } from "@kingdoms/shared";
import { recruitmentCost } from "@kingdoms/shared";
import type { GameState } from "./types.js";
import { resolveBattle } from "./battle-engine.js";

function assertActivePlayer(state: GameState, playerId: string): void { if (state.players.find(player => player.id === playerId)?.status === "banned") throw new Error("ACCOUNT_BANNED"); }
function assertActiveTarget(state: GameState, playerId: string | null | undefined, frozen?: boolean): void { if (frozen || (playerId && state.players.find(player => player.id === playerId)?.status === "banned")) throw new Error("TARGET_FROZEN"); }

export type AttackOrderCancellation = { orderId: string; armyId: string; targetArmyId: string; reason: "target_destroyed" | "target_frozen"; at: string };

export class CombatRepository {
  private commands = new Set<string>();
  // Tick-resolved battles and auto-canceled pursuit orders, drained once per
  // tick by the store (ledger) and the HTTP layer (WebSocket broadcast).
  private reportsToBroadcast: BattleReport[] = [];
  private pendingCancellations: AttackOrderCancellation[] = [];

  drainReports(): BattleReport[] { const out = this.reportsToBroadcast; this.reportsToBroadcast = []; return out; }
  drainCancellations(): AttackOrderCancellation[] { const out = this.pendingCancellations; this.pendingCancellations = []; return out; }

  capture(): { commands: string[] } { return { commands: [...this.commands] }; }
  restore(capture: { commands: string[] }): void { this.commands = new Set(capture.commands); }
  
  constructor(private readonly pool?: Pool) {}

  seed(state: GameState): void {
    if (!state.terrainMap || Object.keys(state.terrainMap).length === 0) {
      state.terrainMap = {};
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
          let terrain: TerrainType = "plains";
          if ((x + y) % 7 === 0) terrain = "hills";
          else if ((x * y) % 11 === 0) terrain = "forest";
          else if ((x + y) % 13 === 0) terrain = "swamp";
          state.terrainMap[`${x},${y}`] = terrain;
        }
      }
    }
  }

  async load(state: GameState): Promise<void> {
    this.seed(state);
    if (!this.pool) return;
    try {
      const terrainRes = await this.pool.query<{ x: number; y: number; terrain_type: string }>(
        `SELECT x, y, terrain_type FROM map_tiles WHERE kingdom_id = $1`, [state.kingdom.id]
      );
      if (terrainRes.rows.length) {
        for (const row of terrainRes.rows) state.terrainMap[`${row.x},${row.y}`] = row.terrain_type as TerrainType;
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
        `INSERT INTO armies (id, player_id, kingdom_id, x, y, unit_type, strength, morale, formation, target_x, target_y, supply, owner_type, npc_kind, source_world_event_id, next_action_at, target_army_id, attack_order_id, attack_seed, attack_issued_at, last_supply_at, frozen, frozen_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         ON CONFLICT (id) DO UPDATE SET player_id=EXCLUDED.player_id, x=EXCLUDED.x, y=EXCLUDED.y, strength=EXCLUDED.strength, morale=EXCLUDED.morale, formation=EXCLUDED.formation, target_x=EXCLUDED.target_x, target_y=EXCLUDED.target_y, supply=EXCLUDED.supply, owner_type=EXCLUDED.owner_type, npc_kind=EXCLUDED.npc_kind, source_world_event_id=EXCLUDED.source_world_event_id, next_action_at=EXCLUDED.next_action_at, target_army_id=EXCLUDED.target_army_id, attack_order_id=EXCLUDED.attack_order_id, attack_seed=EXCLUDED.attack_seed, attack_issued_at=EXCLUDED.attack_issued_at, last_supply_at=EXCLUDED.last_supply_at, frozen=EXCLUDED.frozen, frozen_at=EXCLUDED.frozen_at`,
        [army.id, army.ownerPlayerId, state.kingdom.id, army.x, army.y, army.unitType, army.strength, army.morale, army.formation, army.targetX ?? null, army.targetY ?? null, army.supply, army.ownerType, army.npcKind ?? null, army.sourceWorldEventId ?? null, army.nextActionAt ?? null, army.attackOrder?.targetArmyId ?? null, army.attackOrder?.id ?? null, army.attackOrder?.seed ?? null, army.attackOrder?.issuedAt ?? null, army.lastSupplyAt ?? null, army.frozen ?? false, army.frozenAt ?? null]
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
    if (this.commands.has(commandId)) return false;
    this.commands.add(commandId);
    return true;
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
    if (army.strength <= 0) throw new Error("ARMY_DESTROYED");
    if (!this.claim(commandId)) return "already_processed";

    // A manual move supersedes any pursuit order.
    army.attackOrder = undefined;
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
    if (source.unitType !== target.unitType) throw new Error("UNIT_TYPE_MISMATCH");
    if (source.x !== target.x || source.y !== target.y) throw new Error("NOT_ON_SAME_TILE");
    if (target.strength >= 500) throw new Error("TARGET_ARMY_FULL");
    
    if (!this.claim(commandId)) return "already_processed";
    
    const transfer = Math.min(source.strength, 500 - target.strength);
    source.strength -= transfer;
    target.strength += transfer;
    
    if (source.strength === 0) {
      state.armies = state.armies.filter(a => a.id !== sourceId);
    }
    
    return "accepted";
  }

  attack(commandId: string, attackerArmyId: string, defenderArmyId: string, playerId: string, state: GameState, diplomacy?: any): BattleReport | { pursuit: AttackOrder } {
    assertActivePlayer(state, playerId);
    const attacker = state.armies.find(a => a.id === attackerArmyId);
    const defender = state.armies.find(a => a.id === defenderArmyId);

    if (!attacker || attacker.ownerPlayerId !== playerId) throw new Error("ARMY_ACCESS_DENIED");
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

  resolveEncounter(attacker: Army, defender: Army, seed: number, state: GameState, diplomacy?: any, commandId?: string, broadcast = true): BattleReport {
    const attackerPlayer = attacker.ownerPlayerId ? state.players.find(p => p.id === attacker.ownerPlayerId) : undefined;
    const defenderPlayer = defender.ownerPlayerId ? state.players.find(p => p.id === defender.ownerPlayerId) : undefined;
    const terrain = state.terrainMap[`${attacker.x},${attacker.y}`] ?? "plains";
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
      const output = resolveBattle(input);
    
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
    
    // Apply damage
    attacker.strength = output.attacker.strengthAfter;
    attacker.morale = output.attacker.moraleAfter;
    defender.strength = output.defender.strengthAfter;
    defender.morale = output.defender.moraleAfter;
    
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
    if (broadcast) this.reportsToBroadcast.push(report);

    // Clean up destroyed armies
    if (attacker.strength === 0) state.armies = state.armies.filter(a => a.id !== attacker.id);
    if (defender.strength === 0) state.armies = state.armies.filter(a => a.id !== defender.id);

    return report;
  }

  tick(state: GameState, diplomacy?: any): boolean {
    let changed = false;
    for (const army of state.armies) {
      if (army.frozen || (army.ownerPlayerId && state.players.find(player => player.id === army.ownerPlayerId)?.status === "banned")) continue;
      if (army.strength <= 0) continue;

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
          const speed = army.unitType === "cavalry" ? 2 : 1;
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



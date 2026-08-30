import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Army, BattleReport, Formation, TerrainType, UnitType, FactionId } from "@kingdoms/shared";
import type { GameState, Player, MilitaryStats } from "./types.js";
import { resolveBattle } from "./battle-engine.js";

const recruitmentCosts = {
  infantry: { wood: 50, stone: 30, iron: 10 },
  cavalry: { wood: 30, stone: 20, iron: 40 },
  archer: { wood: 40, stone: 10, iron: 20 },
};

export class CombatRepository {
  private commands = new Set<string>();
  
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
    for (const army of state.armies) {
      await client.query(
        `INSERT INTO armies (id, player_id, kingdom_id, x, y, unit_type, strength, morale, formation, target_x, target_y, supply) 
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET x=EXCLUDED.x, y=EXCLUDED.y, strength=EXCLUDED.strength, morale=EXCLUDED.morale, formation=EXCLUDED.formation, target_x=EXCLUDED.target_x, target_y=EXCLUDED.target_y, supply=EXCLUDED.supply`,
        [army.id, army.ownerPlayerId, state.kingdom.id, army.x, army.y, army.unitType, army.strength, army.morale, army.formation, army.targetX ?? null, army.targetY ?? null, army.supply]
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
    const city = state.cities.find(item => item.id === cityId);
    if (!city || city.playerId !== playerId) throw new Error("CITY_ACCESS_DENIED");
    if ((city.buildings.barracks ?? 0) < 1) throw new Error("BUILDING_REQUIRED");
    
    const cost = recruitmentCosts[unitType];
    const multiplier = amount / 10;
    if (city.resources.wood < cost.wood * multiplier || city.resources.stone < cost.stone * multiplier || city.resources.iron < cost.iron * multiplier) {
      throw new Error("INSUFFICIENT_RESOURCES");
    }
    
    const playerArmies = state.armies.filter(a => a.ownerPlayerId === playerId);
    if (playerArmies.length >= 5) throw new Error("ARMY_CAP_REACHED");
    
    if (!this.claim(commandId)) throw new Error("already_processed");
    
    city.resources.wood -= cost.wood * multiplier;
    city.resources.stone -= cost.stone * multiplier;
    city.resources.iron -= cost.iron * multiplier;
    
    const army: Army = {
      id: randomUUID(),
      ownerPlayerId: playerId,
      x: city.x,
      y: city.y,
      unitType,
      strength: amount,
      morale: 100,
      formation: "line",
      supply: 100
    };
    state.armies.push(army);
    return army;
  }

  moveArmy(commandId: string, armyId: string, targetX: number, targetY: number, playerId: string, state: GameState): string {
    const army = state.armies.find(a => a.id === armyId);
    if (!army || army.ownerPlayerId !== playerId) throw new Error("ARMY_ACCESS_DENIED");
    if (army.strength <= 0) throw new Error("ARMY_DESTROYED");
    if (!this.claim(commandId)) return "already_processed";
    
    army.targetX = targetX;
    army.targetY = targetY;
    return "accepted";
  }

  setFormation(commandId: string, armyId: string, formation: Formation, playerId: string, state: GameState): string {
    const army = state.armies.find(a => a.id === armyId);
    if (!army || army.ownerPlayerId !== playerId) throw new Error("ARMY_ACCESS_DENIED");
    if (!this.claim(commandId)) return "already_processed";
    army.formation = formation;
    return "accepted";
  }

  mergeArmies(commandId: string, sourceId: string, targetId: string, playerId: string, state: GameState): string {
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

  attack(commandId: string, attackerArmyId: string, defenderArmyId: string, playerId: string, state: GameState, diplomacy?: any): BattleReport {
    const attacker = state.armies.find(a => a.id === attackerArmyId);
    const defender = state.armies.find(a => a.id === defenderArmyId);
    
    if (!attacker || attacker.ownerPlayerId !== playerId) throw new Error("ARMY_ACCESS_DENIED");
    if (!defender) throw new Error("TARGET_NOT_FOUND");
    if (attacker.ownerPlayerId === defender.ownerPlayerId) throw new Error("INVALID_TARGET");
    if (attacker.x !== defender.x || attacker.y !== defender.y) throw new Error("NOT_ON_SAME_TILE");
    if (attacker.strength <= 0 || defender.strength <= 0) throw new Error("ARMY_DESTROYED");
    
    const attackerPlayer = state.players.find(p => p.id === attacker.ownerPlayerId)!;
    const defenderPlayer = state.players.find(p => p.id === defender.ownerPlayerId)!;
    
    if (!this.claim(commandId)) throw new Error("already_processed");
    
    const seed = Array.from(commandId).reduce((val, char) => (val * 31 + char.charCodeAt(0)) >>> 0, 7);
    const terrain = state.terrainMap[`${attacker.x},${attacker.y}`] ?? "plains";
    
    const input = {
      attacker: { unitType: attacker.unitType, strength: attacker.strength, morale: attacker.morale, formation: attacker.formation, supply: attacker.supply, factionId: attackerPlayer.factionId },
      defender: { unitType: defender.unitType, strength: defender.strength, morale: defender.morale, formation: defender.formation, supply: defender.supply, factionId: defenderPlayer.factionId },
      terrain,
      seed
    };
    
          if (diplomacy) {
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
        playerId: attackerPlayer.id,
        armyId: attacker.id,
        unitType: attacker.unitType,
        formation: attacker.formation,
        strengthBefore: attacker.strength,
        strengthAfter: output.attacker.strengthAfter,
        moraleBefore: attacker.morale,
        moraleAfter: output.attacker.moraleAfter,
        supplyBefore: attacker.supply
      },
      defender: {
        playerId: defenderPlayer.id,
        armyId: defender.id,
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
    const attStats = state.militaryThroughput[attackerPlayer.id] ??= { victories: 0, defeats: 0, draws: 0, strengthDestroyed: 0, strengthLost: 0, tilesControlled: 0, successfulDefenses: 0 };
    const defStats = state.militaryThroughput[defenderPlayer.id] ??= { victories: 0, defeats: 0, draws: 0, strengthDestroyed: 0, strengthLost: 0, tilesControlled: 0, successfulDefenses: 0 };
    
    const attLost = report.attacker.strengthBefore - report.attacker.strengthAfter;
    const defLost = report.defender.strengthBefore - report.defender.strengthAfter;
    
    attStats.strengthLost += attLost;
    attStats.strengthDestroyed += defLost;
    defStats.strengthLost += defLost;
    defStats.strengthDestroyed += attLost;
    
    if (output.victor === "attacker") {
      attStats.victories++;
      defStats.defeats++;
    } else if (output.victor === "defender") {
      defStats.victories++;
      defStats.successfulDefenses++;
      attStats.defeats++;
    } else {
      attStats.draws++;
      defStats.draws++;
    }
    
    state.battleReports.push(report);
    
    // Clean up destroyed armies
    if (attacker.strength === 0) state.armies = state.armies.filter(a => a.id !== attacker.id);
    if (defender.strength === 0) state.armies = state.armies.filter(a => a.id !== defender.id);
    
    return report;
  }

  tick(state: GameState): boolean {
    let changed = false;
    for (const army of state.armies) {
      if (army.strength <= 0) continue;
      
      // Morale recovery (slowly regains up to 100 if supplied)
      if (army.supply >= 50 && army.morale < 100) {
        army.morale = Math.min(100, army.morale + 2);
        changed = true;
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
    }
    return changed;
  }
}



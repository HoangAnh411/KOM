import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Army, UnitType } from "@kingdoms/shared";
import { gameRules } from "@kingdoms/shared";
import type { GameState } from "./types.js";
import { CombatRepository } from "./combat.js";
import { EventLedger } from "./event-ledger.js";

const unitTypes: UnitType[] = ["infantry", "cavalry", "archer"];
const mapExtent = gameRules.map.extent;

function hash(value: string): number { return Array.from(value).reduce((total, char) => (Math.imul(total, 31) + char.charCodeAt(0)) >>> 0, 2166136261); }

// Persistent neutral raiders: up to RAIDER_TARGET_COUNT on the map, deterministic
// strength, hunting player armies (never cities or caravans in Alpha). Shares the
// combat resolver and event ledger with world-event NPCs; no player ownership.
export class RaiderEngine {
  constructor(private readonly combat: CombatRepository = new CombatRepository(), private readonly ledger: EventLedger = new EventLedger()) {}

  seed(state: GameState): void {
    this.normalize(state);
    const now = Date.now();
    state.raiderSpawnState ??= { sequence: 0 };
    if (state.raiderSpawnState.sequence === 0) {
      // Fresh world: populate the initial band immediately.
      this.ensureTargetCount(state, now);
    } else {
      // Restart of a persisted world: respect the respawn cooldown instead of
      // topping the band up instantly; start the clock if no record survived.
      state.raiderSpawnState.nextRespawnAt ??= new Date(now + gameRules.raiders.respawnDelayMs).toISOString();
    }
  }

  private normalize(state: GameState): void {
    state.raiderSpawnState ??= { sequence: 0 };
    for (const army of state.armies) { army.ownerType ??= "player"; army.ownerPlayerId ??= null; }
  }

  private ensureTargetCount(state: GameState, now: number, single = false): boolean {
    let spawned = false;
    const count = state.armies.filter(army => army.ownerType === "npc" && army.npcKind === "raider").length;
    let missing = gameRules.raiders.targetCount - count;
    if (single) missing = Math.min(1, missing);
    for (let index = 0; index < missing; index++) {
      const sequence = state.raiderSpawnState.sequence++;
      const tile = this.spawnTile(state, sequence);
      const strength = gameRules.raiders.strengthMin + hash(`raider:${sequence}:${state.season.id}`) % (gameRules.raiders.strengthMax - gameRules.raiders.strengthMin + 1);
      const unitType = unitTypes[hash(`raider:${sequence}:unit`) % unitTypes.length];
      const army: Army = {
        id: randomUUID(), ownerType: "npc", ownerPlayerId: null, npcKind: "raider",
        x: tile.x, y: tile.y, unitType, strength, morale: 100, formation: "line", supply: 100,
        lastSupplyAt: new Date(now).toISOString(),
        nextActionAt: new Date(now + gameRules.raiders.actionIntervalMs).toISOString(),
      };
      state.armies.push(army);
      this.ledger.append({ eventType: "raider.spawned", aggregateType: "raider", aggregateId: army.id, payload: { sequence, x: tile.x, y: tile.y, strength, unitType } });
      spawned = true;
    }
    return spawned;
  }

  private spawnTile(state: GameState, sequence: number): { x: number; y: number } {
    const occupied = new Set([...state.cities, ...state.armies].map(item => `${item.x},${item.y}`));
    const candidates: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < mapExtent; y++) {
      for (let x = 0; x < mapExtent; x++) {
        if (occupied.has(`${x},${y}`)) continue;
        const distanceToCity = state.cities.reduce((min, city) => Math.min(min, Math.abs(city.x - x) + Math.abs(city.y - y)), Infinity);
        if (distanceToCity >= gameRules.raiders.minTilesFromCity) candidates.push({ x, y });
      }
    }
    if (candidates.length) return candidates[sequence % candidates.length];
    for (let y = 0; y < mapExtent; y++) for (let x = 0; x < mapExtent; x++) if (!occupied.has(`${x},${y}`)) return { x, y };
    return { x: 0, y: 0 };
  }

  tick(state: GameState, now = Date.now()): boolean {
    this.normalize(state);
    let changed = false;
    const raiders = state.armies.filter(army => army.ownerType === "npc" && army.npcKind === "raider");
    if (raiders.length < gameRules.raiders.targetCount) {
      const at = state.raiderSpawnState.nextRespawnAt;
      if (!at) {
        // First tick detecting a shortage: start the cooldown here so a kill
        // never spawns instantly on a stale expired timestamp.
        state.raiderSpawnState.nextRespawnAt = new Date(now + gameRules.raiders.respawnDelayMs).toISOString();
        changed = true;
      } else if (Date.parse(at) <= now) {
        changed = this.ensureTargetCount(state, now, true) || changed;
        state.raiderSpawnState.nextRespawnAt = state.armies.filter(army => army.ownerType === "npc" && army.npcKind === "raider").length < gameRules.raiders.targetCount
          ? new Date(now + gameRules.raiders.respawnDelayMs).toISOString()
          : undefined;
        changed = true;
      }
    } else if (state.raiderSpawnState.nextRespawnAt !== undefined) {
      // Full band: no respawn clock may survive — a stale timer from an earlier
      // shortfall would otherwise fire the moment a raider dies later.
      state.raiderSpawnState.nextRespawnAt = undefined;
      changed = true;
    }
    for (const raider of raiders) {
      if (Date.parse(raider.nextActionAt ?? "") > now) continue;
      const targets = state.armies
        .filter(army => army.ownerType === "player" && army.strength > 0 && !army.frozen && state.players.find(player => player.id === army.ownerPlayerId)?.status !== "banned")
        .map(army => ({ army, distance: Math.abs(army.x - raider.x) + Math.abs(army.y - raider.y) }))
        .filter(target => target.distance <= gameRules.raiders.huntRadius)
        .sort((a, b) => a.distance - b.distance || a.army.id.localeCompare(b.army.id));
      const target = targets[0]?.army;
      if (target) {
        if (target.x === raider.x && target.y === raider.y) {
          const seed = hash(`raider:${raider.id}:${target.id}:${raider.nextActionAt}`);
          const report = this.combat.resolveEncounter(raider, target, seed, state);
          this.ledger.append({
            eventType: "raider.attack", aggregateType: "raider", aggregateId: raider.id,
            payload: { targetArmyId: target.id, seed, input: { attackerArmyId: raider.id, defenderArmyId: target.id, attacker: { ...raider }, defender: { ...target } }, result: report },
          });
        } else if (Math.abs(target.x - raider.x) >= Math.abs(target.y - raider.y)) raider.x += target.x > raider.x ? 1 : -1;
        else raider.y += target.y > raider.y ? 1 : -1;
      }
      raider.nextActionAt = new Date(now + gameRules.raiders.actionIntervalMs).toISOString();
      changed = true;
    }
    return changed;
  }

  async persist(client: PoolClient, state: GameState): Promise<void> {
    if (!state.raiderSpawnState) return;
    await client.query(
      "INSERT INTO npc_spawn_state (kingdom_id, spawn_sequence, next_raider_spawn_at) VALUES ($1,$2,$3) ON CONFLICT (kingdom_id) DO UPDATE SET spawn_sequence=EXCLUDED.spawn_sequence, next_raider_spawn_at=EXCLUDED.next_raider_spawn_at",
      [state.kingdom.id, state.raiderSpawnState.sequence, state.raiderSpawnState.nextRespawnAt ?? null]
    );
  }
}
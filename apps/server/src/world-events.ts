import { randomUUID } from "node:crypto";
import type { Army, UnitType, WorldEvent, WorldEventType } from "@kingdoms/shared";
import type { GameState } from "./types.js";
import { CombatRepository } from "./combat.js";
import { EventLedger } from "./event-ledger.js";
import { config } from "./config.js";

const eventDuration: Record<WorldEventType, [number, number]> = {
  drought: [300, 900], plague: [180, 600], earthquake: [1, 1], mob_migration: [300, 1200], gold_rush: [600, 1800]
};
const eventTypes: WorldEventType[] = ["drought", "plague", "earthquake", "mob_migration", "gold_rush"];
const unitTypes: UnitType[] = ["infantry", "cavalry", "archer"];

function hash(value: string): number { return Array.from(value).reduce((total, char) => (Math.imul(total, 31) + char.charCodeAt(0)) >>> 0, 2166136261); }
function random(seed: number): () => number { let current = seed >>> 0; return () => { current += 0x6d2b79f5; let n = current; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; }; }

export class WorldEventEngine {
  constructor(private readonly combat: CombatRepository = new CombatRepository(), private readonly ledger: EventLedger = new EventLedger()) {}

  seed(state: GameState): void {
    state.worldEvents ??= [];
    for (const event of state.worldEvents) event.seed ??= hash(event.id);
    for (const army of state.armies) { army.ownerType ??= "player"; army.ownerPlayerId ??= null; }
  }

  spawn(state: GameState, eventType: WorldEventType, seed: number, now = Date.now()): WorldEvent {
    const rng = random(seed); const x = Math.floor(rng() * 16) + 2; const y = Math.floor(rng() * 16) + 2;
    const affectedTiles = [{ x, y }, { x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }].filter(tile => tile.x >= 0 && tile.x < 20 && tile.y >= 0 && tile.y < 20);
    const [min, max] = eventDuration[eventType];
    const event: WorldEvent = {
      id: randomUUID(), kingdomId: state.kingdom.id, eventType, affectedTiles,
      modifier: eventType === "drought" ? { harvest: 0.5 } : eventType === "gold_rush" ? { harvest: 2 } : {},
      startsAt: new Date(now).toISOString(), endsAt: new Date(now + (min + Math.floor(rng() * Math.max(1, max - min + 1))) * 1000).toISOString(),
      severity: Math.floor(rng() * 3) + 1, seed
    };
    state.worldEvents.push(event);
    if (eventType === "earthquake") this.applyEarthquake(event, state, rng);
    if (eventType === "mob_migration") this.spawnMobs(event, state, rng, now);
    this.ledger.append({ eventType: "world_event.spawned", aggregateType: "world_event", aggregateId: event.id, payload: event });
    return event;
  }

  maybeSpawnEvent(state: GameState, now = Date.now()): WorldEvent | null {
    if (state.worldEvents.some(event => Date.parse(event.endsAt) > now)) return null;
    const tickSeed = hash(`${state.season.id}:${Math.floor(now / 1000)}`); const rng = random(tickSeed);
    if (rng() >= config.worldEventSpawnChance) return null;
    const configuredType = eventTypes.includes(config.worldEventType as WorldEventType) ? config.worldEventType as WorldEventType : undefined;
    return this.spawn(state, configuredType ?? eventTypes[Math.floor(rng() * eventTypes.length)], tickSeed, now);
  }

  private applyEarthquake(event: WorldEvent, state: GameState, rng: () => number): void {
    for (const city of state.cities.filter(city => !city.frozen && state.players.find(player => player.id === city.playerId)?.status !== "banned" && event.affectedTiles.some(tile => tile.x === city.x && tile.y === city.y))) {
      const keys = Object.keys(city.buildings).filter(key => city.buildings[key] > 0);
      if (keys.length) { const key = keys[Math.floor(rng() * keys.length)]; city.buildings[key] = Math.max(key === "town_hall" ? 1 : 0, city.buildings[key] - 1); }
    }
  }

  private spawnMobs(event: WorldEvent, state: GameState, rng: () => number, now: number): void {
    const count = 2 + Math.floor(rng() * 2);
    for (let index = 0; index < count; index++) {
      const tile = event.affectedTiles[Math.floor(rng() * event.affectedTiles.length)];
      state.armies.push({
        id: randomUUID(), ownerType: "npc", ownerPlayerId: null, npcKind: "migration", sourceWorldEventId: event.id,
        nextActionAt: new Date(now + 10_000).toISOString(), x: tile.x, y: tile.y,
        unitType: unitTypes[Math.floor(rng() * unitTypes.length)], strength: 50 + Math.floor(rng() * 51), morale: 100, formation: "line", supply: 100,
        lastSupplyAt: new Date(now).toISOString()
      });
    }
  }

  private tickMobs(event: WorldEvent, state: GameState, now: number): boolean {
    let changed = false;
    for (const mob of state.armies.filter(army => army.ownerType === "npc" && army.sourceWorldEventId === event.id)) {
      if (Date.parse(mob.nextActionAt ?? "") > now) continue;
      const targets = state.armies.filter(army => army.ownerType === "player" && army.strength > 0 && !army.frozen && state.players.find(player => player.id === army.ownerPlayerId)?.status !== "banned")
        .map(army => ({ army, distance: Math.abs(army.x - mob.x) + Math.abs(army.y - mob.y) }))
        .filter(target => target.distance <= 3)
        .sort((a, b) => a.distance - b.distance || a.army.id.localeCompare(b.army.id));
      const target = targets[0]?.army;
      if (target) {
        if (target.x === mob.x && target.y === mob.y) {
          const seed = hash(`${event.seed ?? 0}:${mob.id}:${target.id}:${mob.nextActionAt}`);
          const input = { attackerArmyId: mob.id, defenderArmyId: target.id, attacker: { ...mob }, defender: { ...target } };
          const report = this.combat.resolveEncounter(mob, target, seed, state);
          this.ledger.append({ eventType: "world_event.npc_battle", aggregateType: "world_event", aggregateId: event.id, payload: { eventId: event.id, seed, input, result: report } });
        } else if (Math.abs(target.x - mob.x) >= Math.abs(target.y - mob.y)) mob.x += target.x > mob.x ? 1 : -1;
        else mob.y += target.y > mob.y ? 1 : -1;
      }
      mob.nextActionAt = new Date(now + 10_000).toISOString(); changed = true;
    }
    return changed;
  }

  tick(state: GameState, now = Date.now()): boolean {
    this.seed(state); let changed = Boolean(this.maybeSpawnEvent(state, now));
    for (const event of state.worldEvents) {
      if (Date.parse(event.startsAt) > now || Date.parse(event.endsAt) <= now) continue;
      if (event.eventType === "plague") for (const army of state.armies.filter(army => !army.frozen && (!army.ownerPlayerId || state.players.find(player => player.id === army.ownerPlayerId)?.status !== "banned") && event.affectedTiles.some(tile => tile.x === army.x && tile.y === army.y))) {
        army.strength = Math.max(0, army.strength - 5 * event.severity); army.morale = Math.max(0, army.morale - 10 * event.severity); changed = true;
      }
      if (event.eventType === "mob_migration") changed = this.tickMobs(event, state, now) || changed;
    }
    const expiredIds = new Set(state.worldEvents.filter(event => Date.parse(event.endsAt) <= now).map(event => event.id));
    if (expiredIds.size) { state.worldEvents = state.worldEvents.filter(event => !expiredIds.has(event.id)); state.armies = state.armies.filter(army => !army.sourceWorldEventId || !expiredIds.has(army.sourceWorldEventId)); changed = true; }
    return changed;
  }

  harvestModifier(x: number, y: number, state: GameState): number { return state.worldEvents.filter(event => event.affectedTiles.some(tile => tile.x === x && tile.y === y)).reduce((modifier, event) => modifier * (event.modifier.harvest ?? 1), 1); }
}

import { gameRules, regionTileCounts, regions, type Army, type RegionState } from "@kingdoms/shared";
import type { GameState } from "./types.js";

function claimantAt(armies: readonly Army[], seatX: number, seatY: number, isBanned: (playerId: string) => boolean): { playerId: string | null; contested: boolean; armyId: string | null } {
  const present = armies.filter(army => army.ownerType === "player" && army.ownerPlayerId && army.strength > 0 && !army.frozen && !army.deployedOperationId && !isBanned(army.ownerPlayerId) && Math.abs(army.x - seatX) + Math.abs(army.y - seatY) <= gameRules.territory.captureRadius);
  if (!present.length) return { playerId: null, contested: false, armyId: null };
  const nearest = Math.min(...present.map(army => Math.abs(army.x - seatX) + Math.abs(army.y - seatY)));
  const closest = present.filter(army => Math.abs(army.x - seatX) + Math.abs(army.y - seatY) === nearest);
  const players = new Set(closest.map(army => army.ownerPlayerId!));
  if (players.size !== 1) return { playerId: null, contested: players.size > 1, armyId: null };
  const playerId = [...players][0]!;
  return { playerId, contested: false, armyId: closest.find(army => army.ownerPlayerId === playerId)?.id ?? null };
}

export function ensureRegionStates(state: GameState, now = Date.now()): void {
  state.regionStates ??= {};
  for (const region of regions) state.regionStates[region.code] ??= { code: region.code, controllerPlayerId: state.regionControl?.[region.code] ?? null, contestingPlayerId: null, captureProgressMs: 0, garrisonArmyId: null, contested: false, revision: 0, lastChangedAt: new Date(now).toISOString() };
}

export function tickTerritory(state: GameState, deltaMs: number, now = Date.now(), isBanned: (playerId: string) => boolean = () => false): boolean {
  ensureRegionStates(state, now);
  let changed = false;
  for (const region of regions) {
    const current = state.regionStates[region.code]!;
    const claimant = claimantAt(state.armies, region.seatX, region.seatY, isBanned);
    const before = JSON.stringify(current);
    current.contested = claimant.contested;
    if (claimant.contested) { /* Pause the active capture; do not discard its progress. */ }
    else if (!claimant.playerId) {
      current.contestingPlayerId = null;
      current.captureProgressMs = Math.max(0, current.captureProgressMs - gameRules.territory.decayPerSecond * deltaMs);
    } else if (claimant.playerId === current.controllerPlayerId) {
      current.contestingPlayerId = null; current.captureProgressMs = 0; current.garrisonArmyId = claimant.armyId;
    } else {
      if (current.contestingPlayerId !== claimant.playerId) { current.contestingPlayerId = claimant.playerId; current.captureProgressMs = 0; }
      current.captureProgressMs += deltaMs;
      if (current.captureProgressMs >= gameRules.territory.captureDurationMs) {
        current.controllerPlayerId = claimant.playerId; current.contestingPlayerId = null; current.captureProgressMs = 0; current.garrisonArmyId = claimant.armyId; current.revision++; current.lastChangedAt = new Date(now).toISOString();
      }
    }
    if (before !== JSON.stringify(current)) changed = true;
  }
  const next = regionControlFromStates(state.regionStates);
  if (JSON.stringify(next) !== JSON.stringify(state.regionControl)) { state.regionControl = next; state.regionControlRevision++; changed = true; }
  return changed;
}

export const regionControlFromStates = (states: Record<string, RegionState>): Record<string, string> => Object.fromEntries(Object.values(states).flatMap(region => region.controllerPlayerId && !region.contested ? [[region.code, region.controllerPlayerId]] : []));
export function controlledTilesFromStates(states: Record<string, RegionState>): Record<string, number> { const counts = regionTileCounts(); const out: Record<string, number> = {}; for (const region of Object.values(states)) if (region.controllerPlayerId && !region.contested) out[region.controllerPlayerId] = (out[region.controllerPlayerId] ?? 0) + (counts[region.code] ?? 0); return out; }

// Compatibility helpers for isolated rules/tests. They describe fully-secured seats.
export function regionControl(armies: readonly Army[], isBanned: (playerId: string) => boolean = () => false): Record<string, string> { const out: Record<string, string> = {}; for (const region of regions) { const claim = claimantAt(armies, region.seatX, region.seatY, isBanned); if (claim.playerId && !claim.contested) out[region.code] = claim.playerId; } return out; }
export function controlledTiles(armies: readonly Army[], isBanned?: (playerId: string) => boolean): Record<string, number> { const control = regionControl(armies, isBanned); const counts = regionTileCounts(); const out: Record<string, number> = {}; for (const [code, playerId] of Object.entries(control)) out[playerId] = (out[playerId] ?? 0) + (counts[code] ?? 0); return out; }
export function provinceControl(armies: readonly Army[], isBanned: (playerId: string) => boolean = () => false) { const control = regionControl(armies, isBanned); const counts = regionTileCounts(); return regions.map(region => ({ code: region.code, name: region.name, seatX: region.seatX, seatY: region.seatY, tileCount: counts[region.code] ?? 0, controllerPlayerId: control[region.code] ?? null })); }

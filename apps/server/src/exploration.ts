import {
  worldExplorationResolution,
  worldExtent,
  type Exploration,
} from "@kingdoms/shared";
import type { GameState } from "./types.js";

const BYTE_COUNT = Math.ceil(worldExplorationResolution ** 2 / 8);

function decode(encoded: string | undefined): Uint8Array {
  if (!encoded) return new Uint8Array(BYTE_COUNT);
  try {
    const source = Buffer.from(encoded, "base64");
    const result = new Uint8Array(BYTE_COUNT);
    result.set(source.subarray(0, BYTE_COUNT));
    return result;
  } catch {
    return new Uint8Array(BYTE_COUNT);
  }
}

function encode(mask: Uint8Array): string {
  return Buffer.from(mask).toString("base64");
}

function reveal(mask: Uint8Array, x: number, y: number, radiusInWorldTiles: number): boolean {
  const scale = worldExplorationResolution / worldExtent;
  const centerX = Math.floor(x * scale);
  const centerY = Math.floor(y * scale);
  const radius = Math.max(1, Math.ceil(radiusInWorldTiles * scale));
  let changed = false;
  for (let cy = Math.max(0, centerY - radius); cy <= Math.min(worldExplorationResolution - 1, centerY + radius); cy += 1) {
    for (let cx = Math.max(0, centerX - radius); cx <= Math.min(worldExplorationResolution - 1, centerX + radius); cx += 1) {
      if ((cx - centerX) ** 2 + (cy - centerY) ** 2 > radius ** 2) continue;
      const bit = cy * worldExplorationResolution + cx;
      const byte = bit >> 3;
      const flag = 1 << (bit & 7);
      if ((mask[byte]! & flag) !== 0) continue;
      mask[byte] = mask[byte]! | flag;
      changed = true;
    }
  }
  return changed;
}

export function refreshExploration(state: GameState, playerId: string): Exploration {
  const current = state.explorationMasks[playerId];
  const mask = decode(current?.encodedMask);
  let changed = false;
  for (const city of state.cities) if (city.playerId === playerId) changed = reveal(mask, city.x, city.y, 22) || changed;
  for (const army of state.armies) if (army.ownerPlayerId === playerId && army.strength > 0) changed = reveal(mask, army.x, army.y, 14) || changed;
  const next = {
    resolution: worldExplorationResolution,
    revision: (current?.revision ?? 0) + (changed ? 1 : 0),
    encodedMask: encode(mask),
  };
  state.explorationMasks[playerId] = next;
  return next;
}

export function fullExploration(): Exploration {
  return {
    resolution: worldExplorationResolution,
    revision: 0,
    encodedMask: encode(new Uint8Array(BYTE_COUNT).fill(0xff)),
  };
}

export function explorationContains(exploration: Exploration, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= worldExtent || y >= worldExtent) return false;
  const cx = Math.min(exploration.resolution - 1, Math.floor(x * exploration.resolution / worldExtent));
  const cy = Math.min(exploration.resolution - 1, Math.floor(y * exploration.resolution / worldExtent));
  const bit = cy * exploration.resolution + cx;
  const bytes = decode(exploration.encodedMask);
  return (bytes[bit >> 3]! & (1 << (bit & 7))) !== 0;
}

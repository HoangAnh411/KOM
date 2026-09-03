// Client-side validation mirrors the server rules so disabled buttons match what
// the server accepts (cost ≤ stockpile, cargo ≤ depot capacity, cargo ≤ warehouse
// resources, harvest ≤ remaining). Reasons are shown in the UI.

import { gameRules } from "@kingdoms/shared";
import type { Army, City, Depot, ResourceNode } from "@kingdoms/shared";
import { formatCost, resourceKeys, resourceLabels, type ResourceBundle } from "./vocabulary.js";

export type Cargo = { wood: number; stone: number; iron: number };

export const cargoTotal = (cargo: Cargo): number => cargo.wood + cargo.stone + cargo.iron;

export const depotFor = (depots: Depot[], cityId: string): Depot | undefined => depots.find(depot => depot.cityId === cityId);

/** Whether the city can pay, and if not, *which* resource is short. The reason
 *  is the point: "không đủ tài nguyên" makes a player guess, and guessing is why
 *  `CityPanel` used to let them click a build they could not afford and take a
 *  400 from the server as the answer.
 *
 *  Written over `resourceKeys` rather than the three keys costs happen to use
 *  today, so a future food cost cannot silently pass unchecked. */
export function affordable(city: City, cost: ResourceBundle): { ok: boolean; reason?: string } {
  const short = resourceKeys.filter(key => (cost[key] ?? 0) > city.resources[key]);
  if (short.length === 0) return { ok: true };
  return { ok: false, reason: `Không đủ ${short.map(key => resourceLabels[key]).join(", ")} — cần ${formatCost(cost)}.` };
}

export function harvestReady(node: ResourceNode, amount: number): { ok: boolean; reason?: string } {
  if (amount <= 0) return { ok: false, reason: "Chọn lượng khai thác." };
  if (amount > node.remaining) return { ok: false, reason: `Mỏ chỉ còn ${node.remaining}, không đủ ${amount}.` };
  return { ok: true };
}

export function cargoWithinCapacity(depot: Depot | undefined, cargo: Cargo): boolean {
  return !!depot && cargoTotal(cargo) > 0 && cargoTotal(cargo) <= depot.capacity;
}

export function cargoWithinResources(city: City, cargo: Cargo): boolean {
  return cargo.wood <= city.resources.wood && cargo.stone <= city.resources.stone && cargo.iron <= city.resources.iron;
}

export function caravanReady(depot: Depot | undefined, city: City, cargo: Cargo): { ok: boolean; reason?: string } {
  if (cargoTotal(cargo) <= 0) return { ok: false, reason: "Chưa chọn hàng hóa." };
  if (!depot) return { ok: false, reason: "Cần trạm tiếp tế (road_depot) trước khi gửi hàng." };
  if (cargoTotal(cargo) > depot.capacity) return { ok: false, reason: `Vượt sức chứa kho: ${depot.capacity} tối đa mỗi chuyến.` };
  if (!cargoWithinResources(city, cargo)) return { ok: false, reason: "Không đủ tài nguyên trong kho để gửi." };
  return { ok: true };
}

export function routeReady(depot: Depot | undefined, destinationId: string): { ok: boolean; reason?: string } {
  if (!depot) return { ok: false, reason: "Cần trạm tiếp tế (road_depot) trước khi lập tuyến." };
  if (!destinationId) return { ok: false, reason: "Chọn điểm đến." };
  return { ok: true };
}

// Action bar gating: every order requires ownership, a live unfrozen army;
// attack additionally needs an enemy, merge needs a same-type same-tile
// partner that keeps the result under the strength cap.
export const isOwnLiveArmy = (army: Army | undefined, playerId: string): boolean =>
  !!army && army.ownerPlayerId === playerId && army.strength > 0 && !army.frozen;

export const hasEnemy = (armies: Army[], playerId: string): boolean =>
  armies.some(army => army.ownerPlayerId !== playerId && army.strength > 0 && !army.frozen);

export function mergeCandidates(armies: Army[], army: Army, playerId: string): Army[] {
  const max = gameRules.army.maxStrengthPerArmy;
  return armies.filter(candidate =>
    candidate.ownerPlayerId === playerId && candidate.id !== army.id
    && candidate.strength > 0 && !candidate.frozen
    && candidate.unitType === army.unitType
    && candidate.x === army.x && candidate.y === army.y
    && candidate.strength + army.strength <= max);
}

export const hasOrder = (army: Army | undefined): boolean =>
  !!army && (army.attackOrder !== undefined || army.targetX !== undefined);

export const cancelable = (army: Army | undefined): boolean => hasOrder(army);
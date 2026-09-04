import { gameRules, regionTileCounts, regions, type Army } from "@kingdoms/shared";

/** Who holds the sixteen provinces, and how much ground that is.
 *
 *  `militaryScore` has always paid up to 300 of its 1000 points for `tilesControlled`, and
 *  until now no line of code ever moved that number: three tenths of the military axis was
 *  dead. This module is the rule that makes the field mean something. The sixteen provinces
 *  themselves are real data — `resource_nodes.region_id` carries the province id the rule reads
 *  below. The `regions` table and `map_tiles.region_id` are still relics: nothing inserts either
 *  one, and clearing them out is a migration rather than part of this rule.
 *
 *  Control is a snapshot of where armies stand, not a running total: it is recomputed every
 *  tick, so a province changes hands the moment someone marches in, and marching away gives
 *  it up. That is the opposite of `victories`, which only ever counts up, and it is why
 *  holding ground has to be *held*.
 *
 *  Pure on purpose — it takes armies and answers with tiles, touching no store and no clock —
 *  so the situation table in `territory.test.ts` can state the rule directly. */

export type ProvinceControl = {
  readonly code: string;
  readonly name: string;
  readonly seatX: number;
  readonly seatY: number;
  readonly tileCount: number;
  readonly controllerPlayerId: string | null;
};

/** An army that can claim ground: a player's, alive, and not frozen out of the game. A banned
 *  player's armies carry `frozen` (set by `setPlayerStatus`), and the store also passes its own
 *  `isBanned` so a state loaded from a database that disagrees with the flag still resolves the
 *  same way — the same belt-and-braces `applySupplyZones` uses. */
function canClaim(army: Army, isBanned: (playerId: string) => boolean): army is Army & { ownerPlayerId: string } {
  if (army.ownerType !== "player" || !army.ownerPlayerId) return false;
  if (army.strength <= 0 || army.frozen) return false;
  return !isBanned(army.ownerPlayerId);
}

/** The player standing closest to the seat, or `null` if nobody is within reach or two of them
 *  are equally close. Ties go unheld rather than to whoever the array happens to list first:
 *  army order in state is an accident of insertion, and a contested province should read as
 *  contested rather than as a scoreboard entry that flips when a row moves. */
function holderOfSeat(armies: readonly Army[], seatX: number, seatY: number, isBanned: (playerId: string) => boolean): string | null {
  const { captureRadius } = gameRules.territory;
  let nearest = Infinity;
  const closest = new Set<string>();
  for (const army of armies) {
    if (!canClaim(army, isBanned)) continue;
    const distance = Math.abs(army.x - seatX) + Math.abs(army.y - seatY);
    if (distance > captureRadius || distance > nearest) continue;
    if (distance < nearest) { nearest = distance; closest.clear(); }
    closest.add(army.ownerPlayerId);
  }
  return closest.size === 1 ? closest.values().next().value! : null;
}

/** All sixteen provinces in authored order, each with its holder. Returned whole rather than
 *  only the held ones because this is also what the snapshot needs to draw the map: a province
 *  nobody holds is a fact worth showing. */
export function provinceControl(armies: readonly Army[], isBanned: (playerId: string) => boolean = () => false): ProvinceControl[] {
  const tileCounts = regionTileCounts();
  return regions.map(region => ({
    code: region.code,
    name: region.name,
    seatX: region.seatX,
    seatY: region.seatY,
    tileCount: tileCounts[region.code] ?? 0,
    controllerPlayerId: holderOfSeat(armies, region.seatX, region.seatY, isBanned),
  }));
}

/** Tiles held per player, keyed by player id — the shape `militaryThroughput.tilesControlled`
 *  wants. Players holding nothing are absent rather than zero, so the caller decides whether an
 *  empty result is worth a row. */
export function controlledTiles(armies: readonly Army[], isBanned?: (playerId: string) => boolean): Record<string, number> {
  const tiles: Record<string, number> = {};
  for (const province of provinceControl(armies, isBanned)) {
    if (province.controllerPlayerId === null) continue;
    tiles[province.controllerPlayerId] = (tiles[province.controllerPlayerId] ?? 0) + province.tileCount;
  }
  return tiles;
}

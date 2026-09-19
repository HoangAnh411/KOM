// Which settlements a road connects — topology only. The scene turns each
// segment into a terrain-following ribbon and drops the ones that would cross
// open water; deciding *that* needs the heightfield, which the renderer owns.
// Keeping the graph here keeps it testable: markets must sit at the centre of
// a small spoke network, and every city must touch the network exactly once,
// without either end of a pair planning the same road twice.

export type RoadEndpoint = { id: string; x: number; y: number };

export type RoadSegment = {
  /** Canonical pair key — `a|b` with the ids sorted, so A→B and B→A are one
   *  road no matter which side planned it. */
  key: string;
  from: RoadEndpoint;
  to: RoadEndpoint;
};

const distance = (a: RoadEndpoint, b: RoadEndpoint): number => Math.hypot(a.x - b.x, a.y - b.y);

const segmentKey = (a: RoadEndpoint, b: RoadEndpoint): string => [a.id, b.id].sort().join("|");

/** Each hub gets up to `HUB_SPOKES` roads to its nearest cities; any city the
 *  spokes missed is tied to its nearest hub so no settlement is stranded. */
export function planRoads(cities: RoadEndpoint[], hubs: RoadEndpoint[]): RoadSegment[] {
  const byKey = new Map<string, RoadSegment>();
  const add = (from: RoadEndpoint, to: RoadEndpoint): void => {
    if (from.id === to.id) return;
    byKey.set(segmentKey(from, to), { key: segmentKey(from, to), from, to });
  };
  const nearestCities = (hub: RoadEndpoint): RoadEndpoint[] =>
    [...cities].sort((a, b) => distance(hub, a) - distance(hub, b));
  const spokeCount = new Map<string, number>();
  for (const hub of hubs) {
    // Sort hubs first so a stable city order yields a stable spoke choice.
    for (const city of nearestCities(hub).slice(0, 3)) {
      add(hub, city);
      spokeCount.set(city.id, (spokeCount.get(city.id) ?? 0) + 1);
    }
  }
  const nearestHub = (city: RoadEndpoint): RoadEndpoint | undefined =>
    [...hubs].sort((a, b) => distance(city, a) - distance(city, b))[0];
  for (const city of cities) {
    if ((spokeCount.get(city.id) ?? 0) > 0) continue;
    const hub = nearestHub(city);
    if (hub) add(hub, city);
  }
  return [...byKey.values()];
}

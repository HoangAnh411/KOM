import assert from "node:assert/strict";
import test from "node:test";
import { planRoads, type RoadEndpoint } from "./world-3d/roads.js";

const city = (id: string, x: number, y: number): RoadEndpoint => ({ id, x, y });

test("spokes go to the three nearest cities, and farther cities ride the fallback", () => {
  const hubs = [city("hub", 0, 0)];
  const near = [city("a", 1, 0), city("b", 2, 0), city("c", 3, 0)];
  const far = [city("d", 50, 50), city("e", 60, 60)];
  const roads = planRoads([...near, ...far], hubs);
  // Three spokes plus one fallback road per stranded city — nothing more.
  assert.equal(roads.length, 5);
  const touches = (id: string): number => roads.filter(road => road.from.id === id || road.to.id === id).length;
  for (const endpoint of [...near, ...far]) assert.equal(touches(endpoint.id), 1, `${endpoint.id} has ${touches(endpoint.id)} roads`);
  // The spokes are exactly what the near-only world would plan: adding far
  // cities must not redraw the roads of the near ones.
  const nearKeys = new Set(planRoads(near, hubs).map(road => road.key));
  for (const key of nearKeys) assert.ok(roads.some(road => road.key === key), `spoke ${key} was redrawn`);
});

test("a road planned from both ends is one road", () => {
  // hub's nearest city is "city" and city's nearest hub is "hub" — both rules
  // fire for the same pair.
  const roads = planRoads([city("city", 5, 5)], [city("hub", 4, 4)]);
  assert.equal(roads.length, 1);
  assert.equal(roads[0]!.key, "city|hub");
  assert.equal(new Set(roads.map(road => road.key)).size, roads.length, "duplicate keys slipped through");
});

test("an empty world plans no roads, and the plan is deterministic", () => {
  assert.deepEqual(planRoads([], []), []);
  assert.deepEqual(planRoads([], [city("hub", 0, 0)]), []);
  const cities = [city("a", 1, 1), city("b", 9, 2), city("c", 3, 8)];
  const hubs = [city("h1", 0, 0), city("h2", 10, 10)];
  assert.deepEqual(planRoads(cities, hubs), planRoads(cities, hubs));
});

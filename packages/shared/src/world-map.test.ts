import assert from "node:assert/strict";
import test from "node:test";
import { gameRules, terrainModifiers, type TerrainType } from "./index.js";
import {
  anchors, citySiteAnchors, regionAt, regionByCodeOrThrow, regionCodeAt, regionRows, regionTileCounts,
  regions, terrainAt, terrainChars, terrainRows, worldExtent, worldId, worldMapDigest, worldTerrainTypes,
} from "./world-map.js";

/** The map is two string literals, so the things that could go wrong with it are the things
 *  that go wrong with hand-typed data: a row a character short, a province that got cut in
 *  half by a boundary edit, a seat that ended up in the neighbouring province, an anchor
 *  outside the window where a city can be founded. None of those would throw at runtime —
 *  they would ship a world that looks nearly right and scores wrongly. Every one is a test
 *  here, and the digest at the bottom makes any edit at all a visible diff. */

const codes = regions.map(region => region.code);

test("both grids are square, the same size, and spelled with legal characters only", () => {
  assert.equal(worldExtent, 36);
  assert.equal(regionRows.length, worldExtent);
  for (const [index, row] of terrainRows.entries()) {
    assert.equal(row.length, worldExtent, `terrain row ${index} is ${row.length} characters`);
    for (const char of row) assert.ok(char in terrainChars, `terrain row ${index} has ${JSON.stringify(char)}`);
  }
  for (const [index, row] of regionRows.entries()) {
    assert.equal(row.length, worldExtent, `region row ${index} is ${row.length} characters`);
    for (const char of row) assert.ok(codes.includes(char), `region row ${index} has ${JSON.stringify(char)}`);
  }
  // The grid decides the size, so the rules cannot hold a different one.
  assert.equal(gameRules.map.extent, worldExtent);
});

test("every terrain character maps to a type the battle engine has a modifier for", () => {
  assert.deepEqual([...new Set(Object.values(terrainChars))].sort(), [...worldTerrainTypes].sort());
  for (const type of worldTerrainTypes) {
    const modifiers: Record<string, number> = terrainModifiers[type satisfies TerrainType];
    assert.ok(modifiers, `no terrain modifier for ${type}`);
  }
  // Every character is used: an unused one is a legend entry for terrain nobody drew.
  const painted = new Set(terrainRows.join(""));
  for (const char of Object.keys(terrainChars)) assert.ok(painted.has(char), `nothing on the map is ${char}`);
});

test("all sixteen provinces exist, are one connected blob, and are within a fifth of each other in size", () => {
  const counts = regionTileCounts();
  assert.equal(Object.keys(counts).length, 16);
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), worldExtent * worldExtent);
  for (const code of codes) {
    const tiles = new Set<string>();
    for (let y = 0; y < worldExtent; y += 1) for (let x = 0; x < worldExtent; x += 1) {
      if (regionCodeAt(x, y) === code) tiles.add(`${x},${y}`);
    }
    assert.equal(tiles.size, counts[code], `${code} tile count disagrees with the grid`);
    // Flood fill: a province in two pieces cannot be held by standing an army at its seat,
    // and the boundary wiggle sheds one-tile islands if it is not pinned at the junctions.
    const [first] = tiles;
    const queue = [first!];
    const reached = new Set([first!]);
    while (queue.length) {
      const [x, y] = queue.pop()!.split(",").map(Number) as [number, number];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const key = `${x + dx},${y + dy}`;
        if (tiles.has(key) && !reached.has(key)) { reached.add(key); queue.push(key); }
      }
    }
    assert.equal(reached.size, tiles.size, `province ${code} is in ${tiles.size - reached.size + 1} pieces`);
  }
  // Territory score is proportional to tiles held, so a province twice its neighbour's size
  // would be worth twice as much to hold for the same one army.
  const sizes = Object.values(counts);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= worldExtent * worldExtent / 16 * 0.2,
    `province sizes span ${Math.min(...sizes)}..${Math.max(...sizes)}`);
});

test("every province has a distinct name and a seat that is an anchor inside itself", () => {
  assert.equal(new Set(codes).size, 16, "duplicate province code");
  assert.equal(new Set(regions.map(region => region.name)).size, 16, "duplicate province name");
  for (const region of regions) {
    assert.equal(regionCodeAt(region.seatX, region.seatY), region.code,
      `seat of ${region.name} at ${region.seatX},${region.seatY} is in ${regionCodeAt(region.seatX, region.seatY)}`);
    assert.ok(anchors.some(anchor => anchor.x === region.seatX && anchor.y === region.seatY),
      `seat of ${region.name} is not an anchor`);
    assert.equal(regionAt(region.seatX, region.seatY), region);
    assert.equal(regionByCodeOrThrow(region.code), region);
  }
  assert.throws(() => regionByCodeOrThrow("Q"), /unknown region code/);
});

test("anchors are unique, inside the placement window, and two mines per province", () => {
  const { minX, maxX, minY, maxY } = gameRules.cityPlacement;
  const seen = new Set<string>();
  const nodesPerRegion: Record<string, number> = Object.fromEntries(codes.map(code => [code, 0]));
  for (const anchor of anchors) {
    const key = `${anchor.x},${anchor.y}`;
    assert.ok(!seen.has(key), `two anchors share ${key}`);
    seen.add(key);
    // An anchor outside the window is capacity that can never be used: no city may be
    // founded there, so its two-tile reach is wasted.
    assert.ok(anchor.x >= minX && anchor.x <= maxX && anchor.y >= minY && anchor.y <= maxY, `anchor ${key} is outside [${minX}..${maxX}]`);
    if (anchor.kind === "node") nodesPerRegion[regionCodeAt(anchor.x, anchor.y)!] += 1;
  }
  assert.equal(anchors.length, 36);
  assert.equal(citySiteAnchors().length, anchors.length);
  for (const [code, count] of Object.entries(nodesPerRegion)) assert.equal(count, 2, `province ${code} has ${count} mines`);
  const markets = anchors.filter(anchor => anchor.kind === "market");
  assert.equal(markets.length, 4);
  assert.equal(new Set(markets.map(market => regionCodeAt(market.x, market.y))).size, 4, "two ports in one province");
  assert.equal(new Set(markets.map(market => market.kind === "market" && market.name)).size, 4, "two ports share a name");
});

test("the resource mix keeps iron scarce and is symmetric across the four quadrants", () => {
  const nodes = anchors.filter((anchor): anchor is Extract<typeof anchor, { kind: "node" }> => anchor.kind === "node");
  const byType = (type: string) => nodes.filter(node => node.resourceType === type).length;
  assert.deepEqual([byType("wood"), byType("stone"), byType("iron")], [12, 12, 8]);
  // One quarter of every resource in each quadrant, which is what makes the four corners
  // equally worth starting in. Quadrants split at the midpoint, not at a province seam.
  const half = worldExtent / 2;
  for (const type of ["wood", "stone", "iron"] as const) {
    const perQuadrant = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([qx, qy]) => nodes.filter(node =>
      node.resourceType === type && Math.floor(node.x / half) === qx && Math.floor(node.y / half) === qy).length);
    assert.deepEqual(perQuadrant, [byType(type) / 4, byType(type) / 4, byType(type) / 4, byType(type) / 4], type);
  }
});

test("terrain says what the ground holds and leaves the ports and seed cities clear", () => {
  for (const anchor of anchors) {
    if (anchor.kind === "market") {
      assert.equal(terrainAt(anchor.x, anchor.y), "plains", `${anchor.name} is not on open ground`);
      continue;
    }
    const expected = anchor.resourceType === "wood" ? "forest" : "hills";
    assert.equal(terrainAt(anchor.x, anchor.y), expected, `the ${anchor.resourceType} mine at ${anchor.x},${anchor.y}`);
  }
  // The seed cities' tiles, inherited from the 20x20 world and still where the logistics and
  // espionage tests expect them.
  for (const [x, y] of [[8, 8], [13, 11]] as const) assert.equal(terrainAt(x, y), "plains", `seed city ${x},${y}`);
});

test("the terrain mix stays close to the world it replaces, so battle balance does not move", () => {
  const total = worldExtent * worldExtent;
  const share = (type: TerrainType) => Object.entries(terrainChars).filter(([, name]) => name === type)
    .reduce((sum, [char]) => sum + terrainRows.join("").split(char).length - 1, 0) / total;
  // The three modulos produced 64% plains / 16% forest / 14% hills / 5% swamp. These are the
  // bands published in docs/GAME-DESIGN.md; drifting out of them is a balance change, and it
  // should be a deliberate one.
  assert.ok(share("plains") >= 0.55 && share("plains") <= 0.68, `plains ${share("plains")}`);
  assert.ok(share("forest") >= 0.13 && share("forest") <= 0.22, `forest ${share("forest")}`);
  assert.ok(share("hills") >= 0.11 && share("hills") <= 0.20, `hills ${share("hills")}`);
  assert.ok(share("swamp") >= 0.03 && share("swamp") <= 0.10, `swamp ${share("swamp")}`);
  // No province may be a write-off: all marsh is unholdable, no open ground is unbuildable.
  for (const code of codes) {
    const own: TerrainType[] = [];
    for (let y = 0; y < worldExtent; y += 1) for (let x = 0; x < worldExtent; x += 1) {
      if (regionCodeAt(x, y) === code) own.push(terrainAt(x, y));
    }
    const swamp = own.filter(type => type === "swamp").length / own.length;
    assert.ok(swamp <= 0.25, `province ${code} is ${Math.round(swamp * 100)}% swamp`);
    assert.ok(own.includes("plains"), `province ${code} has no open ground`);
  }
});

test("province seams are the chokepoints, and every one of them has a way through", () => {
  const onSeam = (x: number, y: number) => (["ns", "ew"] as const).filter(axis => {
    const [nx, ny] = axis === "ns" ? [x + 1, y] : [x, y + 1];
    return nx < worldExtent && ny < worldExtent && regionCodeAt(nx, ny) !== regionCodeAt(x, y);
  });
  const tally = { swamp: 0, swampOnSeam: 0, hillsOnSeam: 0, hillsInland: 0, ns: 0, nsHigh: 0, nsPass: 0, ew: 0, ewMarsh: 0, ewFord: 0 };
  for (let y = 0; y < worldExtent; y += 1) for (let x = 0; x < worldExtent; x += 1) {
    const terrain = terrainAt(x, y);
    const seams = onSeam(x, y);
    if (terrain === "swamp") { tally.swamp += 1; if (seams.length) tally.swampOnSeam += 1; }
    if (terrain === "hills") { if (seams.length) tally.hillsOnSeam += 1; else tally.hillsInland += 1; }
    if (seams.includes("ns")) { tally.ns += 1; if (terrain === "hills") tally.nsHigh += 1; if (terrain === "plains") tally.nsPass += 1; }
    if (seams.includes("ew")) { tally.ew += 1; if (terrain === "swamp") tally.ewMarsh += 1; if (terrain === "plains") tally.ewFord += 1; }
  }
  // Marsh is a border feature and nothing else: all 59 swamp tiles sit on a province seam.
  // That is the rule that makes swamp mean something — you are in it because you are
  // crossing into somebody's province, not because the map felt like it.
  assert.equal(tally.swampOnSeam, tally.swamp, `${tally.swamp - tally.swampOnSeam} swamp tiles are not on a seam`);
  // North-south seams are ridgelines: 106 of 153 today. Node halos and cleared port ground
  // take the rest, which is intended — what a province holds outranks where it ends.
  assert.ok(tally.nsHigh / tally.ns > 0.6, `only ${tally.nsHigh}/${tally.ns} of the north-south seams is high ground`);
  assert.ok(tally.ewMarsh / tally.ew > 0.3, `only ${tally.ewMarsh}/${tally.ew} of the east-west seams is marsh`);
  // A province sealed off entirely would be unattackable, so every sixth seam tile is left
  // open by construction: 37 passes and 35 fords.
  assert.ok(tally.nsPass > 25, `only ${tally.nsPass} passes through the north-south seams`);
  assert.ok(tally.ewFord > 25, `only ${tally.ewFord} fords across the east-west seams`);
  // Hills come from two places — borders and mines — and both have to be visible, or the
  // ground has stopped telling the player which is which.
  assert.ok(tally.hillsOnSeam > 100 && tally.hillsInland > 50, `hills ${tally.hillsOnSeam} border / ${tally.hillsInland} inland`);
});

test("off-map reads answer plains instead of throwing, and fractional ones are not tiles", () => {
  // The battle engine asks about the tile an army stands on. A bad coordinate should cost a
  // modifier, not the request.
  for (const [x, y] of [[-1, 0], [0, -1], [worldExtent, 0], [0, worldExtent], [1.5, 2]] as const) {
    assert.equal(terrainAt(x, y), "plains", `${x},${y}`);
    assert.equal(regionCodeAt(x, y), undefined, `${x},${y}`);
    assert.equal(regionAt(x, y), undefined, `${x},${y}`);
  }
  assert.equal(terrainAt(0, 0), "plains");
  assert.equal(regionCodeAt(0, 0), "A");
  assert.equal(regionCodeAt(worldExtent - 1, worldExtent - 1), "P");
});

test("derived ids are stable, distinct per input, and shaped like a UUID", () => {
  // This is what makes the authored map converge in Postgres: the same tile in the same
  // kingdom must produce the same primary key on every reseed, or a restart piles up a
  // second copy of all 36 anchors.
  assert.equal(worldId("kingdom-1", 6, 8), worldId("kingdom-1", 6, 8));
  assert.notEqual(worldId("kingdom-1", 6, 8), worldId("kingdom-1", 8, 6));
  assert.notEqual(worldId("kingdom-1", 6, 8), worldId("kingdom-2", 6, 8));
  assert.match(worldId("kingdom-1", 6, 8), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  // 36 anchors plus 16 seats in one kingdom: a collision here would be a lost row.
  const ids = new Set([...anchors.map(anchor => worldId("k", anchor.x, anchor.y)), ...regions.map(region => worldId("k", "region", region.code))]);
  assert.equal(ids.size, anchors.length + regions.length);
});

test("the world has a fingerprint, and it is this one", () => {
  // Pinned on purpose. The digest travels in the snapshot so a client drawing a different map
  // than the server resolves battles against is visible rather than silent; pinning it here
  // means editing the map is a one-line diff you have to mean.
  assert.equal(worldMapDigest(), "9272a448fba4bdbd");
  assert.equal(worldMapDigest(), worldMapDigest());
});

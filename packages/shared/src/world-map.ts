/** The world, authored by hand and stored as two grids of characters.
 *
 *  Terrain used to be three modulo expressions in `combat.ts` (`(x+y)%7`, `(x*y)%11`,
 *  `(x+y)%13`). That produced diagonal stripes: no regions, no chokepoints, nothing a
 *  player could learn or remember, and a map the server could describe only by running
 *  the arithmetic again. This file is the map instead — a place rather than a formula.
 *
 *  It lives in `shared` and imports nothing, which is the whole point: the client bakes
 *  its terrain from the same rows the server resolves battles against, so the two cannot
 *  drift, and the grid does not have to travel in every snapshot. Keep it dependency-free
 *  (no `node:crypto`, no zod) — the client bundles this file.
 *
 *  Editing the map is editing these two string literals. `world-map.test.ts` holds the
 *  invariants that make that safe: both grids square, only legal characters, all sixteen
 *  provinces contiguous with a seat inside themselves, every province holding anchors, and
 *  a golden digest so a change to the world is a visible diff rather than a surprise. */

export const worldTerrainTypes = ["plains", "forest", "hills", "swamp"] as const;
export type WorldTerrain = (typeof worldTerrainTypes)[number];

/** The alphabet of `terrainRows`. Single characters on purpose: a 36-wide row of them is
 *  readable as a map in a diff, which a list of names would not be. */
export const terrainChars = { ".": "plains", F: "forest", H: "hills", S: "swamp" } as const satisfies Record<string, WorldTerrain>;

/** Geography, and it is deliberate rather than decorative:
 *
 *  - Forest surrounds every wood node and hills surround every stone or iron mine, so the
 *    ground tells you what is on it before you click anything.
 *  - Province seams running north-south are ridgelines, seams running east-west are marsh.
 *    `terrainModifiers` already favours the defender on hills and punishes the attacker in
 *    swamp, so a border is somewhere worth standing. Every sixth tile of a seam is left as
 *    open ground: a pass, so no province can be walled off from its neighbours.
 *  - The four ports and the two seed cities stand on cleared ground. A market you cannot
 *    march to is a market nobody uses.
 *  - The four quadrants are 90-degree rotations of each other, so no corner is a better
 *    place to start than any other, and the centre — where all four meet at (17.5, 17.5) —
 *    is the contested one. */
export const terrainRows: readonly string[] = [
  ".........H.................H........",
  "..FFF....H........H........H...FFF..",
  ".FFFFF..H...FFF..H....H...H...FFFFF.",
  ".FFFFF.H...FFFFFH....HHH.H....FFFFF.",
  ".FFFFF.H...FFFFFH.....H..H..FFFFFFF.",
  "..FFF...S..FFFFFHSS......HHFFFFFFF..",
  ".....FFFH...FFF.H.......HHHFFFFF....",
  "...SFFFF....S..HHHH.....SHHFFFFF..S.",
  "..H.FFF.....HSS.HHSS....HSHSFFF..H..",
  "SH..FFFF......HHHH.HSH....H..HSSH...",
  ".....FFF......HHHHS.HHH.............",
  "...............H..H..H........FFF...",
  "...H...HS........S.......HS..FFFFF..",
  "..HHH...H.H.....H.........HS.FFFFF..",
  "...H....HHHH.............H.H.FFFFF..",
  "......H...H.....HS......HHH...FFFH..",
  "...SSHHH.H...S.S.H...S...H......HHHS",
  "..H..HH.HSS.H..HSHS..H....HSS....H..",
  ".H...H.HH.HS.....H...HSS..H.HS.H....",
  "......HHHSH...............H.........",
  "...FFF.H.HHH.............H..........",
  "..FFFFF...H.....HSS.....HHH....H....",
  "..FFFFF...........H......H.S..HHH...",
  "..FFFFF...........H........H...H....",
  "...FFF.HS.....H.....H......H.....H..",
  "...SS...H...SHHH...HHH..........HHH.",
  "..H..SSSHS..HSH..HSHHH....HS...H.H.S",
  "SH.....FFF...HS..H....HSH.H.FFF.....",
  "......FFFFF......HS........FFFFF....",
  "......FFFFF.......H..FFF...FFFFF....",
  "..FFF.FFFFF..H......FFFFF..FFFFFFF..",
  ".FFFFF.FFF..HHH...H.FFFFF.H.FFFFFFF.",
  ".FFFFF...H...H..H...FFFFFH....FFFFF.",
  ".FFFFF..H......HHH...FFFHHH...FFFFF.",
  "..FFF..H........H........H.....FFF..",
  "................H.........H.........",
];

/** Sixteen provinces on a 4x4 grid, `A` through `P` reading west to east then north to
 *  south. The seams wiggle by a tile so a border reads as a ridgeline rather than a survey
 *  line, but they are pinned back to nominal wherever the two axes cross: without that the
 *  two wiggles slide past each other at a four-way junction and shed one-tile islands, and
 *  a province that is not one blob cannot be held by standing an army in it. */
export const regionRows: readonly string[] = [
  "AAAAAAAAAABBBBBBBBBCCCCCCCCCDDDDDDDD",
  "AAAAAAAAAABBBBBBBBBCCCCCCCCCDDDDDDDD",
  "AAAAAAAAABBBBBBBBBCCCCCCCCCDDDDDDDDD",
  "AAAAAAAABBBBBBBBBCCCCCCCCCDDDDDDDDDD",
  "AAAAAAAABBBBBBBBBCCCCCCCCCDDDDDDDDDD",
  "AAAAAAAABBBBBBBBBCCCCCCCCCCDDDDDDDDD",
  "AAAAAAAAABBBBBBBBBBCCCCCCCCDDDDDDDDD",
  "AAAAAAAAABBBBBBBBBBCCCCCCCCDDDDDDDDD",
  "AAAEEEAAABBFFBBBBBCCCCCGGCCDDDDDDDHH",
  "AAEEEEEEEFFFFFFBBFGGCCGGGGGHHHDDDHHH",
  "EEEEEEEEEFFFFFFFFFGGGGGGGGGHHHHHHHHH",
  "EEEEEEEEFFFFFFFFFFFGGGGGGGHHHHHHHHHH",
  "EEEEEEEEFFFFFFFFFFFGGGGGGGHHHHHHHHHH",
  "EEEEEEEEEFFFFFFFFGGGGGGGGGGHHHHHHHHH",
  "EEEEEEEEEFFFFFFFFGGGGGGGGGGGHHHHHHHH",
  "EEEEEEEEEEFFFFFFFGGGGGGGGGGGHHHHHHHH",
  "EEEEEEEEEEFFFFFFFFGGGGGGGGGHHHHHHHHH",
  "EEEIIIEEEFFFFJJJFFGGKKGGGGGHHHHHLLLL",
  "EEIIIIEEIJJFFJJJJJKKKKGGGKKLLHHHLLLL",
  "IIIIIIIIIJJJJJJJJJKKKKKKKKKLLLLLLLLL",
  "IIIIIIIIIIJJJJJJJKKKKKKKKKLLLLLLLLLL",
  "IIIIIIIIIIJJJJJJJKKKKKKKKKLLLLLLLLLL",
  "IIIIIIIIIJJJJJJJJJJKKKKKKKKLLLLLLLLL",
  "IIIIIIIIJJJJJJJJJJJKKKKKKKKKLLLLLLLL",
  "IIIIIIIIJJJJJJJJJJJKKKKKKKKKLLLLLLLL",
  "IIIIIIIIIJJJJJJJJJKKKKKKKKKLLLLLLLLL",
  "IIIMMIIIIJJNNJJJJJKKOOKKKKKLLLLLPPLL",
  "IIMMMMMMMNNNNNJJNNOOOOOKKOOPPLLPPPPP",
  "MMMMMMMMMNNNNNNNNNOOOOOOOOOPPPPPPPPP",
  "MMMMMMMMMNNNNNNNNNNOOOOOOOOOPPPPPPPP",
  "MMMMMMMMMMNNNNNNNNNOOOOOOOOOPPPPPPPP",
  "MMMMMMMMMMNNNNNNNNNOOOOOOOOPPPPPPPPP",
  "MMMMMMMMMMNNNNNNNOOOOOOOOOPPPPPPPPPP",
  "MMMMMMMMMNNNNNNNNOOOOOOOOOPPPPPPPPPP",
  "MMMMMMMMNNNNNNNNNOOOOOOOOOOPPPPPPPPP",
  "MMMMMMMMNNNNNNNNNOOOOOOOOOOPPPPPPPPP",
];

/** The width of the world, and the only place it is decided: the grids are square and this
 *  is how many rows they have. `gameRules.map.extent` re-exports it, so resizing the map
 *  means authoring a different map, not editing a number that then disagrees with one. */
export const worldExtent = terrainRows.length;

/** A province, and the tile that decides who holds it. The `seat` is always an anchor — the
 *  province's port if it has one, otherwise the mine nearest its centre — so controlling a
 *  province means holding somewhere that was already worth holding, and the rule has one
 *  tile to point at instead of an area to average.
 *
 *  Names are a first pass in Vietnamese, chosen for the terrain each province actually has
 *  (`Lâm` forest, `Thạch` stone, `Đầm` marsh, `Nguyên` plain, `Cương` frontier). They are
 *  the one thing here the owner may want to rewrite; nothing keys off the text. */
export type WorldRegion = { readonly code: string; readonly name: string; readonly seatX: number; readonly seatY: number };

export const regions: readonly WorldRegion[] = [
  { code: "A", name: "Bắc Lâm", seatX: 3, seatY: 3 },
  { code: "B", name: "Thượng Nguyên", seatX: 13, seatY: 4 },
  { code: "C", name: "Thạch Sơn", seatX: 22, seatY: 3 },
  { code: "D", name: "Đông Lâm", seatX: 32, seatY: 3 },
  { code: "E", name: "Tây Thạch", seatX: 3, seatY: 13 },
  { code: "F", name: "Cửa Chợ Meridian", seatX: 10, seatY: 10 },
  { code: "G", name: "Hải Đông", seatX: 25, seatY: 10 },
  { code: "H", name: "Đông Cương", seatX: 31, seatY: 13 },
  { code: "I", name: "Tây Đầm", seatX: 4, seatY: 22 },
  { code: "J", name: "Nam Giang", seatX: 10, seatY: 25 },
  { code: "K", name: "Trấn Hải", seatX: 25, seatY: 25 },
  { code: "L", name: "Thạch Khê", seatX: 31, seatY: 22 },
  { code: "M", name: "Nam Lâm", seatX: 3, seatY: 32 },
  { code: "N", name: "Hạ Thạch", seatX: 13, seatY: 31 },
  { code: "O", name: "Hạ Nguyên", seatX: 22, seatY: 31 },
  { code: "P", name: "Nam Cương", seatX: 32, seatY: 32 },
];

/** Everything a city may be founded next to: four ports and thirty-two mines, exactly two
 *  mines per province. The count is the point — city sites are tiles within reach of an
 *  anchor, so capacity is a property of how many anchors were authored, not of a distance
 *  rule that got loosened.
 *
 *  The four ports sit on the 90-degree rotation orbit of the old single hub at (10,10), one
 *  per quadrant. Twelve wood, twelve stone and eight iron: strict rotational symmetry forces
 *  multiples of four, and iron stays the scarce one, which is what its slower recovery rate
 *  already said.
 *
 *  Six coordinates are inherited and must not move — the ports at (10,10), the mines at
 *  (6,8), (15,10) and (10,14), and the seed cities at (8,8) and (13,11) — because the
 *  existing logistics and espionage tests describe distances between them. */
export type WorldAnchor =
  | { readonly kind: "market"; readonly x: number; readonly y: number; readonly name: string }
  | { readonly kind: "node"; readonly x: number; readonly y: number; readonly resourceType: "wood" | "stone" | "iron" };

export const anchors: readonly WorldAnchor[] = [
  { kind: "market", x: 10, y: 10, name: "Thương cảng Meridian" },
  { kind: "market", x: 25, y: 10, name: "Thương cảng Hải Đông" },
  { kind: "market", x: 10, y: 25, name: "Thương cảng Nam Giang" },
  { kind: "market", x: 25, y: 25, name: "Thương cảng Trấn Hải" },
  { kind: "node", x: 6, y: 8, resourceType: "wood" },
  { kind: "node", x: 3, y: 3, resourceType: "wood" },
  { kind: "node", x: 13, y: 4, resourceType: "wood" },
  { kind: "node", x: 16, y: 7, resourceType: "iron" },
  { kind: "node", x: 22, y: 3, resourceType: "stone" },
  { kind: "node", x: 25, y: 6, resourceType: "stone" },
  { kind: "node", x: 32, y: 3, resourceType: "wood" },
  { kind: "node", x: 29, y: 6, resourceType: "wood" },
  { kind: "node", x: 3, y: 13, resourceType: "stone" },
  { kind: "node", x: 6, y: 16, resourceType: "stone" },
  { kind: "node", x: 15, y: 10, resourceType: "stone" },
  { kind: "node", x: 10, y: 14, resourceType: "iron" },
  { kind: "node", x: 21, y: 10, resourceType: "stone" },
  { kind: "node", x: 25, y: 15, resourceType: "iron" },
  { kind: "node", x: 31, y: 13, resourceType: "wood" },
  { kind: "node", x: 33, y: 16, resourceType: "iron" },
  { kind: "node", x: 4, y: 22, resourceType: "wood" },
  { kind: "node", x: 7, y: 19, resourceType: "iron" },
  { kind: "node", x: 10, y: 20, resourceType: "stone" },
  { kind: "node", x: 14, y: 25, resourceType: "iron" },
  { kind: "node", x: 20, y: 25, resourceType: "stone" },
  { kind: "node", x: 25, y: 21, resourceType: "iron" },
  { kind: "node", x: 31, y: 22, resourceType: "stone" },
  { kind: "node", x: 33, y: 25, resourceType: "stone" },
  { kind: "node", x: 3, y: 32, resourceType: "wood" },
  { kind: "node", x: 8, y: 29, resourceType: "wood" },
  { kind: "node", x: 13, y: 31, resourceType: "stone" },
  { kind: "node", x: 16, y: 33, resourceType: "stone" },
  { kind: "node", x: 22, y: 31, resourceType: "wood" },
  { kind: "node", x: 25, y: 33, resourceType: "iron" },
  { kind: "node", x: 32, y: 32, resourceType: "wood" },
  { kind: "node", x: 29, y: 29, resourceType: "wood" },
];

const regionByCode = new Map(regions.map(region => [region.code, region]));
const insideWorld = (x: number, y: number): boolean =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < worldExtent && y < worldExtent;

/** Off-map reads answer `plains` rather than throwing: the battle engine asks about the tile
 *  an army stands on, and an army with a bad coordinate should lose a modifier, not the
 *  request. `terrainOverrides` in the snapshot is layered on top of this by the caller. */
export function terrainAt(x: number, y: number): WorldTerrain {
  if (!insideWorld(x, y)) return "plains";
  return terrainChars[terrainRows[y]![x] as keyof typeof terrainChars] ?? "plains";
}

export function regionCodeAt(x: number, y: number): string | undefined {
  return insideWorld(x, y) ? regionRows[y]![x] : undefined;
}

export function regionAt(x: number, y: number): WorldRegion | undefined {
  const code = regionCodeAt(x, y);
  return code === undefined ? undefined : regionByCode.get(code);
}

export function regionByCodeOrThrow(code: string): WorldRegion {
  const region = regionByCode.get(code);
  if (!region) throw new Error(`unknown region code ${code}`);
  return region;
}

/** How many tiles each province owns, counted from the grid rather than declared next to it.
 *  This is the number territory score is scaled against, so a hand edit to the region grid
 *  moves the score with it instead of silently disagreeing. */
export function regionTileCounts(): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(regions.map(region => [region.code, 0]));
  for (const row of regionRows) for (const code of row) if (code in counts) counts[code]! += 1;
  return counts;
}

/** The tiles a city may be founded beside. Deliberately not the anchor objects: callers only
 *  ever want the coordinates, and handing out the union would make every one of them narrow
 *  a `kind` they do not care about. */
export function citySiteAnchors(): Array<{ x: number; y: number }> {
  return anchors.map(anchor => ({ x: anchor.x, y: anchor.y }));
}

/** FNV-1a, four times with a different offset basis each round, formatted as a v4-shaped
 *  UUID. Not cryptographic and not trying to be — it exists so that a row keyed by
 *  `(kingdom, x, y)` gets the same primary key on every reseed, which is what makes the
 *  authored map converge in Postgres instead of piling up a fresh `randomUUID()` per boot.
 *  Deliberately hand-rolled rather than `node:crypto`: the client bundles this file. */
function fnv1a(input: string, round: number): number {
  let hash = (0x811c9dc5 ^ round) >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash ^ input.charCodeAt(index)) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
const hex8 = (value: number): string => value.toString(16).padStart(8, "0");

export function worldId(...parts: Array<string | number>): string {
  const seed = parts.join(":");
  const [a, b, c, d] = [0, 1, 2, 3].map(round => hex8(fnv1a(seed, round))) as [string, string, string, string];
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-8${c.slice(5, 8)}-${c.slice(0, 4)}${d}`;
}

/** A short fingerprint of the whole authored world. It travels in the snapshot so a client
 *  drawing a different map than the server is resolving battles against is a mismatch you
 *  can see, and `world-map.test.ts` pins it, so editing the map is a diff on this line. */
export function worldMapDigest(): string {
  const seed = [
    ...terrainRows,
    ...regionRows,
    ...regions.map(region => `${region.code}:${region.name}:${region.seatX}:${region.seatY}`),
    ...anchors.map(anchor => `${anchor.kind}:${anchor.x}:${anchor.y}:${anchor.kind === "market" ? anchor.name : anchor.resourceType}`),
  ].join("\n");
  return `${hex8(fnv1a(seed, 0))}${hex8(fnv1a(seed, 1))}`;
}

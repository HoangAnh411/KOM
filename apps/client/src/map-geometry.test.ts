import assert from "node:assert/strict";
import test from "node:test";
import { worldMapDigest } from "@kingdoms/shared";
import {
  armyGeometrySig, asciiPrintable, cityGeometrySig, eventSig, isoDepth, labelCharset, labelFitsAtlas,
  mapExtent, maxZoom, minZoom, narrowestViewport, originAt, overlayGeometrySig, pickAt,
  regionLabelZoom, regionLabelsVisible, seatSig, terrainBounds,
  terrainPad, terrainResolution, terrainSig, terrainTextureSize, tileHeight, tileWidth,
  vietnameseLetters, worldPoint, type SigArmy,
} from "./map-geometry.js";

// The projection the renderer used before the world/screen split, kept here as
// the reference every geometry test compares against.
const legacyPoint = (x: number, y: number, originX: number, originY: number): [number, number] =>
  [originX + (x - y) * tileWidth / 2, originY + (x + y) * tileHeight / 2];

test("world projection plus origin reproduces the legacy screen projection", () => {
  const origin = originAt(1200);
  const last = mapExtent - 1;
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [7, 13], [last, last], [last, 0]]) {
    const [wx, wy] = worldPoint(x, y);
    assert.deepEqual([wx + origin.x, wy + origin.y], legacyPoint(x, y, origin.x, origin.y));
  }
});

test("origin clamps to 360 on narrow viewports and tracks half the width above it", () => {
  assert.deepEqual(originAt(400), { x: 360, y: 50 });
  assert.deepEqual(originAt(720), { x: 360, y: 50 });
  assert.deepEqual(originAt(1440), { x: 720, y: 50 });
});

test("terrain bounds cover the whole field including the half-tile bleed", () => {
  const bounds = terrainBounds();
  // Derived from the rule rather than restated: at extent 20 these are the historical
  // 1120x560 world units. The RenderTexture is sized from this, so a change here is a
  // change in texture memory — see the ceiling test below.
  assert.deepEqual(bounds, {
    x: -((mapExtent - 1) * tileWidth / 2) - tileWidth / 2,
    y: -tileHeight / 2,
    width: mapExtent * tileWidth,
    height: mapExtent * tileHeight,
  });
  for (let y = 0; y < mapExtent; y += 1) for (let x = 0; x < mapExtent; x += 1) {
    const [wx, wy] = worldPoint(x, y);
    assert.ok(wx - tileWidth / 2 >= bounds.x && wx + tileWidth / 2 <= bounds.x + bounds.width, `tile ${x},${y} x inside`);
    assert.ok(wy - tileHeight / 2 >= bounds.y && wy + tileHeight / 2 <= bounds.y + bounds.height, `tile ${x},${y} y inside`);
  }
});

// Terrain is baked into ONE RenderTexture, and WebGL only guarantees 4096px per axis.
// So this ceiling — not the renderer's speed — is the hard cap on how wide the world
// may get, and it is asserted rather than left in a comment: extent 20 needs 2244px,
// extent 36 needs 4036 (60 to spare), extent 40 would want 4484 and would fail to
// allocate on the guaranteed floor, silently leaving the map unpainted.
test("the baked terrain texture stays inside the guaranteed 4096px WebGL limit", () => {
  const { width, height } = terrainTextureSize();
  assert.equal(width, (terrainBounds().width + terrainPad * 2) * terrainResolution);
  assert.ok(width <= 4096, `terrain texture is ${width}px wide at extent ${mapExtent}: past 4096 the bake needs chunking`);
  assert.ok(height <= 4096, `terrain texture is ${height}px tall at extent ${mapExtent}: past 4096 the bake needs chunking`);
});

// The smallest zoom has to show the whole world on the narrowest viewport the e2e
// matrix covers, or a resize can strand the player looking at part of the world with
// no way to pull back. The floor is derived from `mapExtent` for exactly that reason,
// so this test states the property instead of the number: at extent 20 it holds with
// room to spare (0.6 shows 672 of 1120 units), at extent 36 the floor moves itself.
test("the zoom floor still fits the whole world width on the narrowest viewport", () => {
  const worldWidth = mapExtent * tileWidth;
  assert.ok(minZoom * worldWidth <= narrowestViewport, `minZoom ${minZoom} shows only ${Math.round(minZoom * worldWidth)}px of a ${worldWidth}-unit world on a ${narrowestViewport}px viewport`);
  assert.ok(minZoom > 0 && maxZoom > minZoom, "the zoom range stays non-empty");
});

test("isometric depth follows screen y and breaks ties deterministically", () => {
  assert.ok(isoDepth(0, 0) < isoDepth(1, 1));
  assert.ok(isoDepth(5, 5) < isoDepth(0, 11));
  // Same diagonal (same screen y): ordering is stable, not insertion-dependent.
  assert.ok(isoDepth(3, 7) < isoDepth(7, 3));
  assert.equal(isoDepth(3, 7), isoDepth(3, 7));
  // Caravans sit between tiles, so fractional input has to keep ordering.
  assert.ok(isoDepth(2, 2) < isoDepth(2.5, 2) && isoDepth(2.5, 2) < isoDepth(3, 3));
});

// === PICKING ===

const origin = originAt(1200);
const screenAt = (x: number, y: number): [number, number] => {
  const [wx, wy] = worldPoint(x, y);
  return [wx + origin.x, wy + origin.y];
};
/** The viewer. Armies below leave `ownerPlayerId` unset, so they are somebody
 *  else's unless a case says otherwise — the ordinary shape of these fixtures. */
const ME = "player-me";

test("picking prefers armies, then cities, then falls through to the tile", () => {
  const armies = [{ id: "a1", x: 5, y: 5, strength: 10 }];
  const cities = [{ id: "c1", x: 5, y: 5 }, { id: "c2", x: 12, y: 3 }];
  assert.deepEqual(pickAt(...screenAt(5, 5), origin, armies, cities, ME), { kind: "army", id: "a1" });
  // 20px out: past the 13px army radius, still inside the 27px city radius.
  const [cx, cy] = screenAt(5, 5);
  assert.deepEqual(pickAt(cx, cy + 20, origin, armies, cities, ME), { kind: "city", id: "c1" });
  assert.deepEqual(pickAt(...screenAt(12, 3), origin, armies, cities, ME), { kind: "city", id: "c2" });
  assert.deepEqual(pickAt(...screenAt(1, 17), origin, armies, cities, ME), { kind: "tile", x: 1, y: 17 });
});

test("picking ignores wiped armies and clicks outside the field", () => {
  const armies = [{ id: "dead", x: 5, y: 5, strength: 0 }];
  assert.deepEqual(pickAt(...screenAt(5, 5), origin, armies, [], ME), { kind: "tile", x: 5, y: 5 });
  assert.equal(pickAt(...screenAt(-3, 4), origin, [], [], ME), undefined);
  // One tile past the far corner: the bound comes off `mapExtent`, so this stays a
  // click outside the field rather than a valid tile after the world is widened.
  assert.equal(pickAt(...screenAt(mapExtent, mapExtent), origin, [], [], ME), undefined);
});

test("picking resolves every tile of the field back to itself", () => {
  for (let y = 0; y < mapExtent; y += 1) for (let x = 0; x < mapExtent; x += 1) {
    assert.deepEqual(pickAt(...screenAt(x, y), origin, [], [], ME), { kind: "tile", x, y });
  }
});

test("closest army wins when two overlap", () => {
  const [sx, sy] = screenAt(5, 5);
  const armies = [{ id: "far", x: 5, y: 5, strength: 9 }, { id: "near", x: 5, y: 5, strength: 9 }];
  assert.deepEqual(pickAt(sx + 4, sy, origin, armies, [], ME), { kind: "army", id: "far" });
  armies[1] = { id: "near", x: 5.1, y: 5, strength: 9 };
  assert.deepEqual(pickAt(sx + 4, sy, origin, armies, [], ME), { kind: "army", id: "near" });
});

// Two armies on one tile project to the same point, so the tie is exact and the
// old rule handed it to whichever the snapshot listed first. A migrating mob
// standing on the player's city therefore ate the click and their own army could
// not be selected at all — the failure `map-command.spec.ts` hit at random on
// CI, and the one a player would read as "the map stopped responding".
test("the player's own army wins an exact tie, in either snapshot order", () => {
  const mob = { id: "mob", x: 5, y: 5, strength: 90 };
  const mine = { id: "mine", x: 5, y: 5, strength: 10, ownerPlayerId: ME };
  assert.deepEqual(pickAt(...screenAt(5, 5), origin, [mob, mine], [], ME), { kind: "army", id: "mine" });
  assert.deepEqual(pickAt(...screenAt(5, 5), origin, [mine, mob], [], ME), { kind: "army", id: "mine" });
  // A null owner is a neutral, not a match for a viewer who has no id yet.
  assert.deepEqual(pickAt(...screenAt(5, 5), origin, [{ ...mob, ownerPlayerId: null }], [], ""), { kind: "army", id: "mob" });
});

test("ownership breaks ties but never outranks distance", () => {
  const [sx, sy] = screenAt(5, 5);
  const mine = { id: "mine", x: 5, y: 5, strength: 10, ownerPlayerId: ME };
  // 4px east of the tile centre: the mob one tenth of a tile over is genuinely
  // closer, and must stay clickable — that is how you target it to attack.
  const nearerMob = { id: "mob", x: 5.1, y: 5, strength: 90 };
  assert.deepEqual(pickAt(sx + 4, sy, origin, [mine, nearerMob], [], ME), { kind: "army", id: "mob" });
  assert.deepEqual(pickAt(sx + 4, sy, origin, [nearerMob, mine], [], ME), { kind: "army", id: "mob" });
});

// === CHANGE SIGNATURES ===
//
// These are the performance invariants of the refactor, not implementation
// trivia: a signature that changes means a Graphics gets re-tessellated or a
// label re-laid-out on that snapshot.

const baseArmy: SigArmy & { morale: number } = {
  ownerType: "player", npcKind: null, unitType: "infantry", ownerPlayerId: "p1",
  strength: 40, frozen: false, morale: 100, x: 4, y: 6,
};

test("army geometry survives movement, morale drift and strength changes", () => {
  const sig = armyGeometrySig(baseArmy, "p1");
  assert.equal(armyGeometrySig({ ...baseArmy, x: 9, y: 2 }, "p1"), sig, "a move is a transform, not a rebuild");
  // Morale drifts every economy tick. It is not drawn, so it must not rebuild.
  const drifted: SigArmy & { morale: number } = { ...baseArmy, morale: 61 };
  assert.equal(armyGeometrySig(drifted, "p1"), sig, "morale is not drawn");
  assert.equal(armyGeometrySig({ ...baseArmy, strength: 39 }, "p1"), sig, "strength is a label, not geometry");
});

test("army geometry rebuilds when the drawn shape or colour actually changes", () => {
  const sig = armyGeometrySig(baseArmy, "p1");
  for (const variant of [
    { unitType: "cavalry" },
    { frozen: true },
    { ownerType: "npc", npcKind: "raider" },
    { ownerType: "npc", npcKind: "migration" },
  ] as Partial<SigArmy>[]) {
    assert.notEqual(armyGeometrySig({ ...baseArmy, ...variant }, "p1"), sig, JSON.stringify(variant));
  }
  // Ownership decides the body colour, so the same army seen by another player
  // must not share a signature.
  assert.notEqual(armyGeometrySig(baseArmy, "p2"), sig);
});

test("city geometry tracks only frozen state and ownership", () => {
  const city = { frozen: false, playerId: "p1", x: 3, y: 3, name: "Đông Kinh" };
  const sig = cityGeometrySig(city, "p1");
  const renamedAndMoved = { ...city, x: 8, y: 1, name: "Tây Đô" };
  assert.equal(cityGeometrySig(renamedAndMoved, "p1"), sig);
  assert.notEqual(cityGeometrySig({ ...city, frozen: true }, "p1"), sig);
  assert.notEqual(cityGeometrySig(city, "p2"), sig);
});

test("overlay geometry is relative, so an army and its target moving together is free", () => {
  const marching: SigArmy = { ...baseArmy, targetX: 9, targetY: 11 };
  const sig = overlayGeometrySig(marching, true);
  // Both ends translate by (+2, +1): the order line's local geometry is identical.
  assert.equal(overlayGeometrySig({ ...marching, x: 6, y: 7, targetX: 11, targetY: 12 }, true), sig);
  // The army closing on a stationary target does change the line.
  assert.notEqual(overlayGeometrySig({ ...marching, x: 6, y: 7 }, true), sig);
  assert.notEqual(overlayGeometrySig(marching, false), sig, "the selection ring is part of the overlay");
});

test("overlay geometry distinguishes attack, move and idle, and drops orders when frozen", () => {
  const idle = overlayGeometrySig(baseArmy, false);
  const moving = overlayGeometrySig({ ...baseArmy, targetX: 9, targetY: 11 }, false);
  const attacking = overlayGeometrySig({ ...baseArmy, attackOrder: { targetX: 9, targetY: 11 } }, false);
  assert.notEqual(moving, idle);
  assert.notEqual(attacking, idle);
  assert.notEqual(attacking, moving, "an attack line and a move line are drawn differently");
  // A frozen army shows no order line, so its overlay collapses onto the idle one.
  assert.equal(overlayGeometrySig({ ...baseArmy, targetX: 9, targetY: 11, frozen: true }, false), idle);
  assert.equal(overlayGeometrySig({ ...baseArmy, attackOrder: { targetX: 9, targetY: 11 }, frozen: true }, false), idle);
});

test("overlay ring distinguishes npc from player armies", () => {
  assert.notEqual(
    overlayGeometrySig({ ...baseArmy, ownerType: "npc" }, true),
    overlayGeometrySig(baseArmy, true),
  );
});

test("terrain and event signatures are stable for equal input and change on real edits", () => {
  const world = worldMapDigest();
  assert.equal(terrainSig(world, { "3,4": "forest" }), terrainSig(world, { "3,4": "forest" }));
  assert.notEqual(terrainSig(world, { "3,4": "forest" }), terrainSig(world, { "3,4": "hill" }));
  assert.equal(terrainSig(world, undefined), terrainSig(world, {}));
  // The grid no longer travels, so a different world reaches the client as a different
  // digest and nothing else. If that did not rebuild the texture, the map would keep
  // drawing the old world while the server adjudicated battles on the new one.
  assert.notEqual(terrainSig(world, {}), terrainSig("0000000000000000", {}));
  assert.notEqual(terrainSig(undefined, {}), terrainSig(world, {}));

  const events = [{ id: "e1", eventType: "mob_migration", severity: 2, affectedTiles: [{ x: 1, y: 2 }] }];
  assert.equal(eventSig(events), eventSig(events.map(event => ({ ...event }))));
  assert.notEqual(eventSig(events), eventSig([{ ...events[0]!, affectedTiles: [{ x: 1, y: 3 }] }]));
  assert.notEqual(eventSig(events), eventSig([]));
});

test("a seat marker is drawn from whose banner flies, not from whose id it is", () => {
  assert.equal(seatSig(undefined, "me"), "unheld");
  assert.equal(seatSig("me", "me"), "own");
  assert.equal(seatSig("rival", "me"), "other");
  // Two rivals trading a seat back and forth is the same amber marker both times, so the
  // signature has to collapse them — otherwise every handover in the world would
  // re-tessellate a diamond to draw the identical thing.
  assert.equal(seatSig("rival", "me"), seatSig("another-rival", "me"), "any foreign holder is one marker");
  assert.notEqual(seatSig("me", "me"), seatSig("rival", "me"));
  assert.notEqual(seatSig("rival", "me"), seatSig(undefined, "me"));
});

test("province names appear on the way in, and are gone at the zoom floor", () => {
  // The floor exists so the whole world fits a 900px viewport; sixteen names at that scale
  // sit about twenty pixels apart. The markers stay at every zoom, so the gate hides text
  // and never the province itself.
  assert.ok(regionLabelZoom > minZoom, "a gate at or below the floor would never hide anything");
  assert.ok(regionLabelZoom <= maxZoom, "a gate above the ceiling would hide the names forever");
  assert.equal(regionLabelsVisible(minZoom), false);
  assert.equal(regionLabelsVisible(regionLabelZoom), true, "the gate is inclusive: reaching it shows the names");
  assert.equal(regionLabelsVisible(regionLabelZoom - 0.01), false);
  assert.equal(regionLabelsVisible(maxZoom), true);
});

// === LABEL CHARSET ===
//
// The bitmap atlas can only draw glyphs it rasterised. Losing a Vietnamese
// letter here would silently drop tone marks from real player content, so the
// charset is asserted rather than trusted.

test("the atlas covers printable ASCII and every precomposed Vietnamese letter", () => {
  assert.equal(asciiPrintable.length, 95);
  assert.ok(asciiPrintable.startsWith(" ") && asciiPrintable.endsWith("~"));
  const letters = Array.from(vietnameseLetters);
  assert.equal(letters.length, 134, "12 base vowels + ăâêôơư + đ with five tones, both cases");
  assert.equal(new Set(letters).size, 134, "no duplicated letter");
  for (const letter of letters) assert.ok(labelFitsAtlas(letter), letter);
  assert.equal(labelCharset, asciiPrintable + vietnameseLetters);
});

test("the atlas covers the diacritics the map actually renders", () => {
  const required =
    "áàảãạ ăâ đ éèẻẽẹ ê íìỉĩị óòỏõọ ôơ úùủũụ ư ýỳỷỹỵ" +
    "ÁÀẢÃẠ ĂÂ Đ ÉÈẺẼẸ Ê ÍÌỈĨỊ ÓÒỎÕỌ ÔƠ ÚÙỦŨỤ Ư ÝỲỶỸỴ";
  for (const char of required) assert.ok(labelFitsAtlas(char), `missing ${char}`);
  // Real label content from the running world.
  for (const label of ["Thương cảng Meridian", "Đông Kinh", "Mỏ sắt", "37", "Kingdoms of Meridian"]) {
    assert.ok(labelFitsAtlas(label), label);
  }
});

test("strings outside the atlas are rejected so they fall back to Text", () => {
  // Player-supplied names can be any script, and the fallback is what keeps
  // them readable instead of blank.
  for (const label of ["王国", "Королевство", "🏰 Keep", "Ω"]) {
    assert.equal(labelFitsAtlas(label), false, label);
  }
  // Decomposed input looks the same but is a different code point sequence.
  assert.equal(labelFitsAtlas("À"), false);
  // Map labels are single-line by construction.
  assert.equal(labelFitsAtlas("Đông\nKinh"), false);
});

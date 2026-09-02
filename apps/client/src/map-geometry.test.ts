import assert from "node:assert/strict";
import test from "node:test";
import {
  armyGeometrySig, asciiPrintable, cityGeometrySig, eventSig, isoDepth, labelCharset, labelFitsAtlas,
  mapExtent, originAt, overlayGeometrySig, pickAt, terrainBounds, terrainSig, tileHeight, tileWidth,
  vietnameseLetters, worldPoint, type SigArmy,
} from "./map-geometry.js";

// The projection the renderer used before the world/screen split, kept here as
// the reference every geometry test compares against.
const legacyPoint = (x: number, y: number, originX: number, originY: number): [number, number] =>
  [originX + (x - y) * tileWidth / 2, originY + (x + y) * tileHeight / 2];

test("world projection plus origin reproduces the legacy screen projection", () => {
  const origin = originAt(1200);
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [7, 13], [19, 19], [19, 0]]) {
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
  // 20x20 diamonds at 56x28 → 1120x560 world units. The RenderTexture is sized
  // from this, so a change here is a change in texture memory.
  assert.deepEqual(bounds, { x: -560, y: -14, width: 1120, height: 560 });
  for (let y = 0; y < mapExtent; y += 1) for (let x = 0; x < mapExtent; x += 1) {
    const [wx, wy] = worldPoint(x, y);
    assert.ok(wx - tileWidth / 2 >= bounds.x && wx + tileWidth / 2 <= bounds.x + bounds.width, `tile ${x},${y} x inside`);
    assert.ok(wy - tileHeight / 2 >= bounds.y && wy + tileHeight / 2 <= bounds.y + bounds.height, `tile ${x},${y} y inside`);
  }
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

test("picking prefers armies, then cities, then falls through to the tile", () => {
  const armies = [{ id: "a1", x: 5, y: 5, strength: 10 }];
  const cities = [{ id: "c1", x: 5, y: 5 }, { id: "c2", x: 12, y: 3 }];
  assert.deepEqual(pickAt(...screenAt(5, 5), origin, armies, cities), { kind: "army", id: "a1" });
  // 20px out: past the 13px army radius, still inside the 27px city radius.
  const [cx, cy] = screenAt(5, 5);
  assert.deepEqual(pickAt(cx, cy + 20, origin, armies, cities), { kind: "city", id: "c1" });
  assert.deepEqual(pickAt(...screenAt(12, 3), origin, armies, cities), { kind: "city", id: "c2" });
  assert.deepEqual(pickAt(...screenAt(1, 17), origin, armies, cities), { kind: "tile", x: 1, y: 17 });
});

test("picking ignores wiped armies and clicks outside the field", () => {
  const armies = [{ id: "dead", x: 5, y: 5, strength: 0 }];
  assert.deepEqual(pickAt(...screenAt(5, 5), origin, armies, []), { kind: "tile", x: 5, y: 5 });
  assert.equal(pickAt(...screenAt(-3, 4), origin, [], []), undefined);
  assert.equal(pickAt(...screenAt(20, 20), origin, [], []), undefined);
});

test("picking resolves every tile of the field back to itself", () => {
  for (let y = 0; y < mapExtent; y += 1) for (let x = 0; x < mapExtent; x += 1) {
    assert.deepEqual(pickAt(...screenAt(x, y), origin, [], []), { kind: "tile", x, y });
  }
});

test("closest army wins when two overlap", () => {
  const [sx, sy] = screenAt(5, 5);
  const armies = [{ id: "far", x: 5, y: 5, strength: 9 }, { id: "near", x: 5, y: 5, strength: 9 }];
  assert.deepEqual(pickAt(sx + 4, sy, origin, armies, []), { kind: "army", id: "far" });
  armies[1] = { id: "near", x: 5.1, y: 5, strength: 9 };
  assert.deepEqual(pickAt(sx + 4, sy, origin, armies, []), { kind: "army", id: "near" });
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
  assert.equal(terrainSig({ "3,4": "forest" }), terrainSig({ "3,4": "forest" }));
  assert.notEqual(terrainSig({ "3,4": "forest" }), terrainSig({ "3,4": "hill" }));
  assert.equal(terrainSig(undefined), terrainSig({}));

  const events = [{ id: "e1", eventType: "mob_migration", severity: 2, affectedTiles: [{ x: 1, y: 2 }] }];
  assert.equal(eventSig(events), eventSig(events.map(event => ({ ...event }))));
  assert.notEqual(eventSig(events), eventSig([{ ...events[0]!, affectedTiles: [{ x: 1, y: 3 }] }]));
  assert.notEqual(eventSig(events), eventSig([]));
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

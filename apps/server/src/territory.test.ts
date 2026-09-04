import test from "node:test";
import assert from "node:assert/strict";
import { gameRules, regionTileCounts, regions } from "@kingdoms/shared";
import { controlledTiles, provinceControl, regionControl } from "./territory.js";
import type { Army } from "@kingdoms/shared";

const seat = regions[0]!; // Bắc Lâm, seat (3,3)
const otherSeat = regions[5]!; // Cửa Chợ Meridian, seat (10,10) — the inherited port

/** A live player army standing on a tile. Fields the rule ignores are filled with whatever
 *  keeps the type honest, so each test below reads as the one thing it varies. */
function army(overrides: Partial<Army> & { x: number; y: number }): Army {
  return {
    id: `army-${overrides.x},${overrides.y}-${overrides.ownerPlayerId ?? "p"}`,
    ownerType: "player",
    ownerPlayerId: "player-one",
    unitType: "infantry",
    strength: 100,
    morale: 100,
    formation: "line",
    supply: 100,
    ...overrides,
  };
}

test("standing beside a seat holds the province, and every province is accounted for", () => {
  const control = provinceControl([army({ x: seat.seatX, y: seat.seatY })]);
  assert.equal(control.length, regions.length, "all sixteen provinces come back, held or not");
  const held = control.filter(province => province.controllerPlayerId !== null);
  assert.deepEqual(held.map(province => province.code), [seat.code]);
  assert.equal(held[0]!.tileCount, regionTileCounts()[seat.code]);
  assert.deepEqual(controlledTiles([army({ x: seat.seatX, y: seat.seatY })]), { "player-one": regionTileCounts()[seat.code] });
});

test("captureRadius is the whole reach: one tile away holds, one more does not", () => {
  assert.equal(gameRules.territory.captureRadius, 1, "the situations below are written for a radius of one");
  const beside = army({ x: seat.seatX + gameRules.territory.captureRadius, y: seat.seatY });
  const beyond = army({ x: seat.seatX + gameRules.territory.captureRadius + 1, y: seat.seatY });
  assert.deepEqual(Object.keys(controlledTiles([beside])), ["player-one"]);
  assert.deepEqual(controlledTiles([beyond]), {}, "a province you are near is not a province you hold");
});

test("the nearer army wins, and equal distance leaves the province unheld", () => {
  const near = army({ x: seat.seatX, y: seat.seatY, ownerPlayerId: "player-one" });
  const oneOff = army({ x: seat.seatX, y: seat.seatY + 1, ownerPlayerId: "player-two" });
  assert.deepEqual(Object.keys(controlledTiles([oneOff, near])), ["player-one"], "closer to the seat wins regardless of army order");
  const tied = army({ x: seat.seatX - 1, y: seat.seatY, ownerPlayerId: "player-one" });
  assert.deepEqual(controlledTiles([oneOff, tied]), {}, "two players equally close leave the seat contested, and it pays nobody");
});

test("a second army of the same player is not a tie with itself", () => {
  const north = army({ x: seat.seatX, y: seat.seatY - 1, ownerPlayerId: "player-one" });
  const south = army({ x: seat.seatX, y: seat.seatY + 1, ownerPlayerId: "player-one" });
  assert.deepEqual(controlledTiles([north, south]), { "player-one": regionTileCounts()[seat.code] });
});

// Every one of these would otherwise be a province nobody can hold, or a score a player keeps
// after they have stopped being able to defend it.
test("raiders, the dead and the frozen do not contest ground", () => {
  const raider = army({ x: seat.seatX, y: seat.seatY, ownerType: "npc", ownerPlayerId: null, npcKind: "raider" });
  assert.deepEqual(controlledTiles([raider]), {}, "an NPC holds nothing");
  const claimant = army({ x: seat.seatX + 1, y: seat.seatY, ownerPlayerId: "player-one" });
  assert.deepEqual(controlledTiles([raider, claimant]), { "player-one": regionTileCounts()[seat.code] }, "and does not block a player who is further out");
  assert.deepEqual(controlledTiles([army({ x: seat.seatX, y: seat.seatY, strength: 0 })]), {}, "a destroyed army holds nothing");
  assert.deepEqual(controlledTiles([army({ x: seat.seatX, y: seat.seatY, frozen: true })]), {}, "a frozen army holds nothing");
  assert.deepEqual(controlledTiles([army({ x: seat.seatX, y: seat.seatY })], () => true), {}, "nor does a banned player's, however the flag reads");
});

test("provinces add up for the player holding both", () => {
  const counts = regionTileCounts();
  const twoProvinces = controlledTiles([army({ x: seat.seatX, y: seat.seatY }), army({ x: otherSeat.seatX, y: otherSeat.seatY })]);
  assert.equal(twoProvinces["player-one"], counts[seat.code]! + counts[otherSeat.code]!);
  // What those tiles are worth is `militaryScore`'s business and is asserted in
  // `packages/shared/src/index.test.ts`, against the same `regionTileCounts()` — the scale is a
  // shared rule, this file is only about who is standing where.
});

// The wire format. Unheld provinces are absent rather than null, because the client reads the
// sixteen names and seats from `world-map.ts` and only asks this map who holds each one.
test("regionControl keys the same answer by province, and says nothing about the unheld", () => {
  const armies = [
    army({ x: seat.seatX, y: seat.seatY, ownerPlayerId: "player-one" }),
    army({ x: otherSeat.seatX, y: otherSeat.seatY, ownerPlayerId: "player-two" }),
  ];
  assert.deepEqual(regionControl(armies), { [seat.code]: "player-one", [otherSeat.code]: "player-two" });
  assert.deepEqual(regionControl([]), {}, "an empty world is an empty map, not sixteen nulls");
  const contested = [army({ x: seat.seatX - 1, y: seat.seatY, ownerPlayerId: "player-one" }), army({ x: seat.seatX, y: seat.seatY + 1, ownerPlayerId: "player-two" })];
  assert.deepEqual(regionControl(contested), {}, "a contested seat is absent, exactly like an empty one");
  assert.deepEqual(regionControl(armies, () => true), {}, "and a banned holder holds nothing here either");
});

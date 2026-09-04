// Pure map geometry: projection, picking, depth and change signatures.
//
// This module holds every part of the renderer that does not touch Pixi or the
// DOM, so the client test runner (bare `node --test` on compiled output) can
// cover it. `map.ts` keeps the imperative Pixi scene; the arithmetic lives here.
//
// The projection is expressed in WORLD space — no screen origin baked in. The
// origin is applied once, as a transform on the world container, which is what
// keeps terrain and entities in sync across a resize.

import { gameRules } from "@kingdoms/shared";

export const tileWidth = 56;
export const tileHeight = 28;
/** Re-exported rather than redeclared: the grid size is server-authoritative
 *  (`gameRules.map.extent`) because battles are resolved against it. Keeping the
 *  old export name means every consumer here is untouched by a resize. */
export const mapExtent = gameRules.map.extent;

/** Narrowest viewport the e2e matrix covers (1920/1440/1280/1024/900). The zoom
 *  floor is pinned to it so a resize can never strand the player looking at part of
 *  the world with no way to pull back. */
export const narrowestViewport = 900;
export const maxZoom = 1.8;
/** Zoom-out floor. Derived, not chosen: it is whichever is smaller of the historical
 *  0.6 and the zoom that fits the full world width on the narrowest viewport. At
 *  extent 20 that is 0.6 unchanged (1120 units need only 0.8); at extent 36 the world
 *  is 2016 units wide and the floor drops itself to ~0.446, so widening the map does
 *  not quietly cut the far edge off. `map-geometry.test.ts` asserts the property. */
export const minZoom = Math.min(0.6, narrowestViewport / (mapExtent * tileWidth));

/** Isometric projection, world space. Affine in (x, y), so interpolating grid
 *  coordinates and projecting equals projecting and then interpolating — the
 *  caravan path relies on that. */
export function worldPoint(x: number, y: number): [number, number] {
  return [(x - y) * tileWidth / 2, (x + y) * tileHeight / 2];
}

/** Screen origin of grid (0,0). Unchanged from the pre-refactor renderer: the
 *  map is pushed right so the HUD sidebar never covers the centre tile. */
export function originAt(viewportWidth: number): { x: number; y: number } {
  return { x: Math.max(viewportWidth / 2, 360), y: 50 };
}

/** Axis-aligned world-space bounds of the whole terrain field, including the
 *  half-tile bleed of the outermost diamonds. Used to size the RenderTexture. */
export function terrainBounds(): { x: number; y: number; width: number; height: number } {
  const halfW = tileWidth / 2;
  const halfH = tileHeight / 2;
  const last = mapExtent - 1;
  const [minX] = worldPoint(0, last);
  const [maxX] = worldPoint(last, 0);
  const [, minY] = worldPoint(0, 0);
  const [, maxY] = worldPoint(last, last);
  return { x: minX - halfW, y: minY - halfH, width: maxX - minX + tileWidth, height: maxY - minY + tileHeight };
}

/** Inset kept around the baked field so the 1px stroke of the outermost diamonds
 *  is not clipped by the texture edge. */
export const terrainPad = 1;

/** Device-pixel ratio the terrain texture is baked at, re-exported from the rules
 *  for the same reason as `mapExtent`: it is half of the arithmetic that caps the
 *  world's size, so it is written down once. */
export const terrainResolution = gameRules.map.textureResolution;

/** Physical pixel size of the single RenderTexture `map.ts` bakes terrain into.
 *
 *  It lives here, next to the bounds it is derived from, because it is the hard cap
 *  on how large the world may grow: WebGL only guarantees 4096px per axis, and the
 *  bake is one texture, not a chunked atlas. Keeping it pure means the ceiling is a
 *  test (`map-geometry.test.ts`) rather than a comment nobody re-derives after a
 *  resize. Extent 36 needs 4036px, 60 to spare; extent 40 would want 4484. */
export function terrainTextureSize(): { width: number; height: number } {
  const bounds = terrainBounds();
  return { width: (bounds.width + terrainPad * 2) * terrainResolution, height: (bounds.height + terrainPad * 2) * terrainResolution };
}

/** Painter's-order depth for entities inside a layer.
 *
 *  Screen y is `(x + y) * tileHeight / 2`, so `x + y` alone is the visual depth.
 *  The `* 64 + x` term is a deterministic tie-break between tiles on the same
 *  diagonal, so two entities never swap places between snapshots. Accepts
 *  fractional coordinates (caravans sit between two cities). */
export function isoDepth(x: number, y: number): number {
  return (x + y) * 64 + x;
}

export type PickArmy = { id: string; x: number; y: number; strength: number; ownerPlayerId?: string | null };
export type PickCity = { id: string; x: number; y: number };
export type PickResult = { kind: "army" | "city"; id: string } | { kind: "tile"; x: number; y: number } | undefined;

/** Hit test in camera-local space, i.e. after pan/zoom have been undone but
 *  before the world origin is subtracted. Arithmetic is identical to the
 *  pre-refactor renderer: armies win ties within 13px, cities within 27px, and
 *  anything else falls through to the inverse projection for a tile pick.
 *
 *  `ownPlayerId` breaks an *exact* tie in the player's favour, and that is the
 *  whole of its job. Several armies routinely stand on one tile — a migrating
 *  mob wanders onto a city, a raider hunts the garrison — and two entities on
 *  the same tile project to the same point, so `distSq` is bit-identical and the
 *  winner used to be whichever the snapshot happened to list first. That made
 *  the player's own army unselectable behind a neutral one: nothing on screen
 *  said why the click did nothing, and there was no gesture to get past it.
 *  Required rather than optional so a new call site cannot silently reintroduce
 *  it. Ownership does *not* outrank distance — a nearer foreign army still wins,
 *  or a mob one tile over could never be clicked at all. */
export function pickAt(sx: number, sy: number, origin: { x: number; y: number }, armies: readonly PickArmy[], cities: readonly PickCity[], ownPlayerId: string): PickResult {
  let bestArmy: { id: string; distSq: number; own: boolean } | undefined;
  for (const army of armies) {
    if (army.strength <= 0) continue;
    const [ax, ay] = worldPoint(army.x, army.y);
    const distSq = (ax + origin.x - sx) ** 2 + (ay + origin.y - sy) ** 2;
    if (distSq > 13 ** 2) continue;
    const own = army.ownerPlayerId === ownPlayerId;
    const better = !bestArmy || distSq < bestArmy.distSq || (distSq === bestArmy.distSq && own && !bestArmy.own);
    if (better) bestArmy = { id: army.id, distSq, own };
  }
  let bestCity: { id: string; distSq: number } | undefined;
  for (const city of cities) {
    const [cx, cy] = worldPoint(city.x, city.y);
    const distSq = (cx + origin.x - sx) ** 2 + (cy + origin.y - sy) ** 2;
    if (distSq <= 27 ** 2 && (!bestCity || distSq < bestCity.distSq)) bestCity = { id: city.id, distSq };
  }
  if (bestArmy && (!bestCity || bestArmy.distSq <= bestCity.distSq)) return { kind: "army", id: bestArmy.id };
  if (bestCity) return { kind: "city", id: bestCity.id };
  // Isometric inverse: dx → (x − y) · tileWidth/2, dy → (x + y) · tileHeight/2.
  const dx = sx - origin.x;
  const dy = sy - origin.y;
  const x = Math.round(((dx * 2) / tileWidth + (dy * 2) / tileHeight) / 2);
  const y = Math.round(((dy * 2) / tileHeight - (dx * 2) / tileWidth) / 2);
  if (x >= 0 && x < mapExtent && y >= 0 && y < mapExtent) return { kind: "tile", x, y };
  return undefined;
}

// === CHANGE SIGNATURES ===
//
// Every entity's position is written to its container transform on every
// snapshot — that is a couple of number assignments and never touches geometry.
// Signatures below therefore cover only the two expensive kinds of change:
// GEOMETRY (re-tessellate a Graphics) and TEXT (re-lay-out a label). A moving
// army matches its old signatures and so keeps both.

export type SigArmy = {
  ownerType?: string; npcKind?: string | null; unitType: string; ownerPlayerId?: string | null;
  strength: number; frozen?: boolean;
  x: number; y: number; targetX?: number; targetY?: number;
  attackOrder?: { targetX: number; targetY: number };
};

/** Army body geometry. Deliberately excludes `x`/`y` (a move is a transform)
 *  and `morale` — morale is not drawn, but it drifts every tick, so the old
 *  combined signature rebuilt every army's geometry and label roughly once a
 *  second for the whole world. */
export function armyGeometrySig(army: SigArmy, ownPlayerId: string): string {
  const own = army.ownerPlayerId === ownPlayerId ? "own" : "other";
  return `${army.ownerType ?? "player"}|${army.npcKind ?? ""}|${army.unitType}|${own}|${army.frozen ? 1 : 0}`;
}

export function cityGeometrySig(city: { frozen?: boolean; playerId?: string }, ownPlayerId: string): string {
  return `${city.frozen ? 1 : 0}|${city.playerId === ownPlayerId ? "own" : "other"}`;
}

/** Selection ring + order line. Local-space geometry depends on the ring offset
 *  and on the target *relative to* the army, so an army and its target moving
 *  together does not rebuild the line. */
export function overlayGeometrySig(army: SigArmy, selected: boolean): string {
  const ring = `${selected ? 1 : 0}|${army.ownerType === "npc" ? "npc" : "player"}`;
  if (army.attackOrder && !army.frozen) return `${ring}|attack|${army.attackOrder.targetX - army.x},${army.attackOrder.targetY - army.y}`;
  if (army.targetX !== undefined && army.targetY !== undefined && !army.frozen) return `${ring}|move|${army.targetX - army.x},${army.targetY - army.y}`;
  return `${ring}|none`;
}

/** What decides whether the terrain texture has to be baked again. The grid itself is
 *  authored in `@kingdoms/shared`, so a digest of *which world this is* plus the tiles
 *  the server says differ from it is the whole input — this used to stringify a 1 296-key
 *  map on every snapshot to discover nothing had changed. A different world must rebuild,
 *  which is why the digest is part of the signature and not an assertion elsewhere. */
export function terrainSig(worldMapDigest: string | undefined, overrides: Record<string, string> | undefined): string {
  return `${worldMapDigest ?? ""}|${JSON.stringify(overrides ?? {})}`;
}

export function eventSig(events: readonly { id: string; eventType: string; severity: unknown; affectedTiles: unknown }[]): string {
  return JSON.stringify(events.map(event => `${event.id}:${event.eventType}:${event.severity}:${JSON.stringify(event.affectedTiles)}`));
}

/** A province seat's marker geometry: whose banner flies over it, in the three states the
 *  marker is drawn in. Not the holder's id — two rivals taking turns holding a seat is the
 *  same amber marker, and rebuilding it on every handover would be redraw for nothing. */
export function seatSig(controllerPlayerId: string | undefined, ownPlayerId: string): string {
  if (!controllerPlayerId) return "unheld";
  return controllerPlayerId === ownPlayerId ? "own" : "other";
}

/** Province names appear only from this zoom up. At the floor (0.4, the whole 36×36 world in a
 *  900px viewport) sixteen names sit about twenty pixels apart and overlap the armies and cities
 *  they are supposed to be behind; the seat markers stay visible at every zoom, so nothing
 *  disappears — only the text does, and it comes back on the way in. A rule rather than a
 *  literal in the wheel handler so `map-geometry.test.ts` can hold it against `minZoom`. */
export const regionLabelZoom = 1;
export const regionLabelsVisible = (zoom: number): boolean => zoom >= regionLabelZoom;

// === LABEL CHARSET ===
//
// Map labels are drawn from one runtime-generated bitmap font atlas instead of a
// canvas texture per label. A bitmap font can only draw glyphs that were
// rasterised into it, and city/hub names are player-supplied, so the charset is
// declared explicitly here and `labelFitsAtlas` decides per string whether the
// bitmap path is safe. Anything outside the atlas falls back to Pixi `Text`,
// which can render any glyph the browser has.

/** All 134 precomposed Vietnamese letters: the 12 base vowels plus ăâêôơư and
 *  đ, each with the five tones. Kingdom, city and hub names are Vietnamese, so
 *  losing any of these would silently drop marks from real player content. */
export const vietnameseLetters =
  "áàảãạ" + "ăắằẳẵặ" + "âấầẩẫậ" + "đ" + "éèẻẽẹ" + "êếềểễệ" + "íìỉĩị" +
  "óòỏõọ" + "ôốồổỗộ" + "ơớờởỡợ" + "úùủũụ" + "ưứừửữự" + "ýỳỷỹỵ" +
  "ÁÀẢÃẠ" + "ĂẮẰẲẴẶ" + "ÂẤẦẨẪẬ" + "Đ" + "ÉÈẺẼẸ" + "ÊẾỀỂỄỆ" + "ÍÌỈĨỊ" +
  "ÓÒỎÕỌ" + "ÔỐỒỔỖỘ" + "ƠỚỜỞỠỢ" + "ÚÙỦŨỤ" + "ƯỨỪỬỮỰ" + "ÝỲỶỸỴ";

/** Printable ASCII (U+0020–U+007E) — digits for strength badges, latin letters
 *  and punctuation for names. */
export const asciiPrintable = Array.from({ length: 0x7f - 0x20 }, (_, index) => String.fromCharCode(0x20 + index)).join("");

export const labelCharset = asciiPrintable + vietnameseLetters;

const atlasChars = new Set(Array.from(labelCharset));

/** True when every character of `text` was rasterised into the atlas. Newlines
 *  are excluded on purpose: map labels are single-line. */
export function labelFitsAtlas(text: string): boolean {
  for (const char of text) if (!atlasChars.has(char)) return false;
  return true;
}

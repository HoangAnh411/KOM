// Entity labels as data, not sentences. The world scene renders whatever this
// module returns onto a small canvas sprite: an icon glyph plus a number when
// the player is close enough to act, a plain coloured dot when they are not.
// Pure on purpose — the zoom ladder and the kind→glyph mapping are the parts
// worth testing, and neither needs a canvas to prove.

import type { IconName } from "../ui/tokens.js";

export type ChipTone = "own" | "other" | "neutral" | "mission";

export type ChipEntity =
  | { kind: "army"; strength: number; own: boolean }
  | { kind: "city"; name: string; own: boolean; unknown: boolean }
  | { kind: "caravan"; own: boolean }
  | { kind: "mission"; title: string }
  | { kind: "hub"; name: string }
  | { kind: "node"; resourceType: "wood" | "stone" | "food" | "iron" }
  | { kind: "seat"; heldBy: "own" | "other" | "none" };

export type ChipPlan =
  | { mode: "dot"; tone: ChipTone }
  | { mode: "chip"; icon: IconName; value: string | null; text: string | null; tone: ChipTone };

/** Zoom ladder, in camera-zoom units (the scene spans roughly 0.015–5.2).
 *  Names are clutter until the player can pick the entity out by shape, and
 *  icon+value is clutter once the entity is a few pixels tall. */
export const CHIP_VALUE_ZOOM = 0.6;
export const CHIP_TEXT_ZOOM = 1.1;

const nodeIcon = (resourceType: "wood" | "stone" | "food" | "iron"): IconName =>
  resourceType === "wood" ? "wood" : resourceType === "stone" ? "stone" : resourceType === "food" ? "food" : "iron";

const iconFor = (entity: ChipEntity): IconName => {
  switch (entity.kind) {
    case "army": return "sword";
    case "city": return "city";
    case "caravan": return "caravan";
    case "mission": return "map-pin";
    case "hub": return "coin";
    case "node": return nodeIcon(entity.resourceType);
    case "seat": return "crown";
  }
};

const toneFor = (entity: ChipEntity): ChipTone => {
  switch (entity.kind) {
    case "army": case "caravan": return entity.own ? "own" : "other";
    case "city": return entity.unknown ? "neutral" : entity.own ? "own" : "other";
    case "mission": return "mission";
    case "hub": return "neutral";
    case "node": return "neutral";
    case "seat": return entity.heldBy === "own" ? "own" : entity.heldBy === "other" ? "other" : "neutral";
  }
};

const valueFor = (entity: ChipEntity): string | null => {
  switch (entity.kind) {
    case "army": return String(entity.strength);
    default: return null;
  }
};

const textFor = (entity: ChipEntity): string | null => {
  switch (entity.kind) {
    case "city": return entity.unknown ? null : entity.name;
    case "mission": return entity.title;
    case "hub": return entity.name;
    default: return null;
  }
};

/** What the label sprite should draw for this entity at this zoom, under this
 *  quality tier's label style. `dot` carries only a tone so the sprite can be
 *  a shared circle texture instead of a per-entity canvas. */
export function chipFor(entity: ChipEntity, zoom: number, style: "chip" | "chip-compact" | "dot"): ChipPlan {
  const tone = toneFor(entity);
  if (style === "dot") return { mode: "dot", tone };
  if (zoom < CHIP_VALUE_ZOOM) return { mode: "dot", tone };
  const value = valueFor(entity);
  if (style === "chip-compact" || zoom < CHIP_TEXT_ZOOM) return { mode: "chip", icon: iconFor(entity), value, text: null, tone };
  const text = textFor(entity);
  return { mode: "chip", icon: iconFor(entity), value, text, tone };
}

/** The full, unabbreviated name for hover tooltips and screen readers — the
 *  one place the words this module removes from the map are allowed to live. */
export function labelTextFor(entity: ChipEntity): string {
  switch (entity.kind) {
    case "army": return entity.own ? `Quân của bạn · ${entity.strength}` : `Quân đối phương · ${entity.strength}`;
    case "city": return entity.unknown ? "Thành chưa xác định" : entity.name;
    case "caravan": return entity.own ? "Cụm xe của bạn" : "Cụm xe";
    case "mission": return entity.title;
    case "hub": return `Chợ ${entity.name}`;
    case "node": return `Mỏ ${entity.resourceType}`;
    case "seat": return entity.heldBy === "own" ? "Lỵ sở do bạn nắm" : entity.heldBy === "other" ? "Lỵ sở đối phương" : "Lỵ sở trống";
  }
}

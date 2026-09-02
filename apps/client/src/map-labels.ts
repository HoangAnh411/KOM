import { BitmapFont, BitmapText, Text } from "pixi.js";
import type { Container } from "pixi.js";
import { labelCharset, labelFitsAtlas } from "./map-geometry.js";

// One shared bitmap-font atlas for every map label.
//
// Before: each label was a Pixi `Text`, i.e. its own canvas, its own text
// measurement pass and its own GPU texture upload — recreated whenever the
// entity's signature changed. Now the glyphs are rasterised once into a single
// atlas and every label is a `BitmapText` that reuses it.
//
// No asset is downloaded and nothing is added to the bundle: the atlas is
// generated at runtime from the same system font stack the old `Text` used, so
// the labels keep their previous typeface.

const fontName = "KomMapLabel";
/** Rasterised once at 24px and scaled down per label (labels use 8–12px). The
 *  stroke is baked at the same 1:4 ratio the old `Text` styles used, so a label
 *  drawn at 12px still gets its ~3px outline. Glyph colour is baked white and
 *  recoloured per label with `tint`, which keeps one atlas for every colour. */
const atlasFontSize = 24;
const atlasStrokeThickness = 6;

let atlasReady = false;
/** Rasterisation is attempted once. Without this latch a headless renderer would
 *  retry `BitmapFont.from` on every label update, which is the opposite of what
 *  the atlas is for. */
let atlasAttempted = false;

/** Generates the atlas on first use. Pixi registers bitmap fonts in a global
 *  cache, so this is process-wide and survives map destroy/recreate: a second
 *  `createWorldMap` reuses the same atlas rather than rasterising another. */
export function ensureLabelFont(): boolean {
  if (atlasReady) return true;
  if (atlasAttempted) return false;
  atlasAttempted = true;
  if (BitmapFont.available[fontName]) { atlasReady = true; return true; }
  try {
    BitmapFont.from(fontName, {
      fontFamily: "Arial",
      fontSize: atlasFontSize,
      fill: 0xffffff,
      stroke: 0x102238,
      strokeThickness: atlasStrokeThickness,
    }, { chars: labelCharset, resolution: 2 });
    atlasReady = true;
  } catch {
    // Canvas rasterisation unavailable (headless/no-2d-context): every label
    // silently falls back to `Text`, which is the pre-refactor behaviour.
    atlasReady = false;
  }
  return atlasReady;
}

export type MapLabel = {
  view: Text | BitmapText;
  /** Updates the label in place. Returns false when the text needs a different
   *  backing type (atlas → `Text` or back), in which case the caller replaces it. */
  setText: (text: string) => boolean;
};

/** Creates a centred label. Uses the atlas when every glyph is in it and falls
 *  back to `Text` otherwise, so a player name in a script the atlas does not
 *  cover still renders correctly. */
export function createLabel(text: string, fontSize: number, color: number): MapLabel {
  const useAtlas = ensureLabelFont() && labelFitsAtlas(text);
  if (useAtlas) {
    const view = new BitmapText(text, { fontName, fontSize, tint: color });
    view.anchor.set(0.5);
    return { view, setText: (next: string) => { if (!labelFitsAtlas(next)) return false; view.text = next; return true; } };
  }
  const strokeThickness = Math.max(2, Math.round(fontSize * atlasStrokeThickness / atlasFontSize));
  const view = new Text(text, { fontFamily: "Arial", fontSize, fill: color, stroke: 0x102238, strokeThickness });
  view.anchor.set(0.5);
  // Hand the label back to the caller only when the atlas exists and can now
  // draw the new text — otherwise update in place, so a renderer without the
  // atlas does not churn a new `Text` on every strength change.
  return { view, setText: (next: string) => {
    if (ensureLabelFont() && labelFitsAtlas(next)) return false;
    view.text = next;
    return true;
  } };
}

/** Places a label and adds it to `parent`. Kept separate so callers can reuse a
 *  label across snapshots and only move it. */
export function attachLabel(parent: Container, label: MapLabel, x: number, y: number): void {
  label.view.position.set(x, y);
  parent.addChild(label.view);
}

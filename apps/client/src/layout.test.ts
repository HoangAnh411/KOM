import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  bandFor, bandForMatches, bandQueries, defaultSurfaces, layoutBands, layoutBreakpoints, shellClass, surfaceElementIds,
  surfaceIds, toggleSurface, type SurfaceState,
} from "./layout.js";

// The Situation Room is half TypeScript and half stylesheet, and the halves have
// to agree: `layout.ts` decides which surfaces are open, `styles.css` decides
// what a band looks like. Neither can see the other at runtime, so the seam is
// asserted here — the breakpoint numbers, the class names, and the grid areas are
// all read back out of the sheet as text. A media query edited on one side only
// fails here instead of collapsing a column in front of a player.

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const sheet = stripComments(styles);
const selector = (name: string): RegExp => new RegExp(`\\.${name}(?![\\w-])`);
/** Every rule body whose selector list mentions the class, across all media blocks. */
const bodies = (name: string): string[] =>
  [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => selector(name).test(m[1]!)).map((m) => m[2]!);

const allOpen: SurfaceState = { kingdom: true, activity: true };
const states = (): SurfaceState[] => [
  allOpen, { kingdom: false, activity: true }, { kingdom: true, activity: false }, { kingdom: false, activity: false },
];

test("bands are decided by the same numbers the stylesheet uses", () => {
  assert.deepEqual([...layoutBands], ["compact", "medium", "wide"]);
  assert.equal(bandFor(0), "compact");
  assert.equal(bandFor(layoutBreakpoints.medium - 1), "compact");
  assert.equal(bandFor(layoutBreakpoints.medium), "medium");
  assert.equal(bandFor(layoutBreakpoints.wide - 1), "medium");
  assert.equal(bandFor(layoutBreakpoints.wide), "wide");
  assert.equal(bandFor(1920), "wide");
  // The four sizes the redesign is verified at, so a breakpoint edit that moves
  // one of them into another band shows up as a failing expectation.
  assert.deepEqual([1920, 1440, 1280, 1024].map(bandFor), ["wide", "wide", "medium", "medium"]);
  for (const query of bandQueries) {
    assert.ok(sheet.includes(`@media ${query}`), `styles.css has no "@media ${query}" block`);
  }
});

test("the band the shell reads from matchMedia is the band bandFor names", () => {
  // The shell counts matching queries rather than measuring a width, so the two
  // arrays have to stay in step: one query per boundary between bands.
  assert.equal(bandQueries.length, layoutBands.length - 1);
  assert.deepEqual([0, 1, 2].map(bandForMatches), ["compact", "medium", "wide"]);
  // Out-of-range counts cannot happen, but must not produce `undefined` if they do.
  assert.equal(bandForMatches(-1), "compact");
  assert.equal(bandForMatches(9), "wide");
  // And both routes agree at each breakpoint: at 1024 exactly one query matches,
  // at 1440 both do.
  assert.equal(bandForMatches(1), bandFor(layoutBreakpoints.medium));
  assert.equal(bandForMatches(2), bandFor(layoutBreakpoints.wide));
  assert.equal(bandForMatches(0), bandFor(layoutBreakpoints.medium - 1));
});

test("the map keeps a dominant track in every band, and the columns yield in order", () => {
  // Kingdom context is strategic and stays wherever it fits as a track; activity
  // is the placeholder surface and is the first to fold, because three open
  // tracks at 1280px would leave the map under 800px wide.
  assert.deepEqual(defaultSurfaces("wide"), { kingdom: true, activity: true });
  assert.deepEqual(defaultSurfaces("medium"), { kingdom: true, activity: false });
  assert.deepEqual(defaultSurfaces("compact"), { kingdom: false, activity: false });
});

test("a collapsed surface can always be reopened, and compact opens only one", () => {
  for (const band of layoutBands) {
    for (const id of surfaceIds) {
      const closed = toggleSurface(allOpen, id, band);
      assert.equal(closed[id], false, `${band}/${id} did not close`);
      assert.equal(toggleSurface(closed, id, band)[id], true, `${band}/${id} did not reopen`);
    }
  }
  // Two flyouts over the map would leave no map underneath.
  assert.deepEqual(toggleSurface({ kingdom: false, activity: true }, "kingdom", "compact"), { kingdom: true, activity: false });
  assert.deepEqual(toggleSurface({ kingdom: true, activity: false }, "activity", "compact"), { kingdom: false, activity: true });
  // Above it they are independent tracks and never fight.
  for (const band of ["medium", "wide"] as const) {
    assert.deepEqual(toggleSurface({ kingdom: true, activity: false }, "activity", band), { kingdom: true, activity: true });
  }
  // Closing is never exclusive, in any band.
  assert.deepEqual(toggleSurface(allOpen, "activity", "compact"), { kingdom: true, activity: false });
});

test("every class the shell can emit has a rule, and an open shell emits no modifier", () => {
  assert.equal(shellClass(allOpen), "situation-room");
  assert.equal(
    shellClass({ kingdom: false, activity: false }),
    "situation-room situation-room--kingdom-closed situation-room--activity-closed",
  );
  for (const state of states()) {
    for (const name of shellClass(state).split(" ")) {
      assert.match(sheet, selector(name), `.${name} has no rule in styles.css`);
    }
  }
  // A closed surface has to collapse its track, or the shell keeps a column of
  // empty space where the panel used to be.
  for (const id of surfaceIds) {
    const rule = bodies(`situation-room--${id}-closed`).join("");
    assert.match(rule, new RegExp(`--kom-col-${id}:\\s*0`), `closing ${id} does not zero its track`);
  }
});

test("the shell is a grid of five named areas, with the map as the flexible one", () => {
  const shell = bodies("situation-room").join("\n");
  assert.match(shell, /display:\s*grid/, "the shell must be a grid, not absolutely positioned");
  for (const area of ["header", "kingdom", "map", "activity", "tray"]) {
    assert.match(shell, new RegExp(`grid-template-areas:[^;]*\\b${area}\\b`, "s"), `no "${area}" area`);
  }
  // `minmax(0, 1fr)` and not `1fr`: a bare 1fr track floors at its content's
  // min-content width, which is how a wide panel pushes the page sideways.
  assert.match(shell, /grid-template-columns:[^;]*minmax\(0,\s*1fr\)/);
  assert.match(bodies("map").join("\n"), /grid-area:\s*map/);
  for (const id of surfaceIds) {
    assert.match(bodies(`${id}-column`).join("\n"), new RegExp(`grid-area:\\s*(${id}|map)`));
  }
});

test("the columns overlay the map by grid area, never by absolute positioning", () => {
  // A flyout is the same grid cell as the map plus a z-index. Absolutely
  // positioning it would take it out of the grid and leave the map's own size
  // unrelated to what the player sees, which is how the Pixi resize contract
  // gets broken.
  for (const id of surfaceIds) {
    for (const body of bodies(`${id}-column`)) {
      assert.equal(/position:\s*absolute/.test(body), false, `.${id}-column must not be absolutely positioned`);
    }
  }
});

test("a hidden column is hidden even though the shell gives it a display", () => {
  // `[hidden]` is a UA rule, so any author `display:` on the same element beats
  // it. Both columns set one, so both need the explicit override — otherwise a
  // collapsed surface stays on screen with `aria-expanded="false"` under it.
  for (const id of surfaceIds) {
    assert.match(sheet, new RegExp(`\\.${id}-column\\[hidden\\][^{]*\\{[^}]*display:\\s*none`));
  }
  for (const elementId of Object.values(surfaceElementIds)) assert.ok(elementId.length > 0);
});

test("the pre-redesign shell is gone rather than left behind as dead CSS", () => {
  for (const name of ["shell", "nav-rail", "action-bar", "top-bar", "viewport-notice"]) {
    assert.equal(selector(name).test(sheet), false, `.${name} is still in styles.css`);
  }
});

test("the layout layer holds no colour literal", () => {
  // Same rule PR2 put on the primitives: colours live in the token layer, and a
  // literal here is a colour the palette cannot restyle.
  assert.equal(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(sheet), false);
});

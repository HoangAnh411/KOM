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

test("the panels' legacy CSS left with the markup that used it", () => {
  // Each of these styled markup the kingdom column no longer writes: a `.actions`
  // band, an emoji `.nav-icon`, a hand-rolled onboarding surface, a paragraph that
  // carried a validation message the button now carries itself. A deleted rule
  // nobody asserts is absent is a rule that grows back — someone greps for the
  // class, finds it in the sheet, and concludes the markup must still exist.
  for (const name of ["actions", "nav-icon", "validation-reason", "building-build", "onboarding-panel", "army-panel-footer",
    // The drawer's nine one-line rules, deleted with the markup they dressed: two
    // list shapes, two event accents, two action containers, and the `.destructive`
    // class the treaty-break button wore before `Button variant="destructive"`.
    "event-row", "vote-card", "event-gold_rush", "event-plague", "governance-actions", "governance-row", "destructive",
    "treaty-row", "treaty-pending", "treaty-active", "treaty-propose"]) {
    assert.equal(selector(name).test(sheet), false, `.${name} is still in styles.css`);
  }
  // The other half, and the more dangerous one: a bare element in the selector.
  // `.logistics-panel button` is (0,1,1) and outranks `.kom-btn--compact` at
  // (0,1,0), so a leftover rule like this does not sit there harmlessly — it takes
  // the padding back off the primitive for every button inside that panel.
  for (const dead of [/\.kingdom-nav\s+button/, /\.logistics-panel\s+button/, /\.pending-row\s+button/, /\.step-actions\s+button/, /\.cargo-grid\s+label/, /\.city-panel\s+h2/,
    // Three more of exactly that shape from the drawer, plus two headings the
    // primitive now sizes: `.pending-strip h3` is (0,1,1) over
    // `.kom-panel__heading` at (0,1,0), and `.drawer summary` reached past the
    // disclosure it was written for into every `<details>` in the archive panel,
    // which is why it is `.drawer > summary` now.
    /\.alliance-panel\s+li\s+button/, /\.archive-panel\s+details/, /\.pending-strip\s+h3/, /\.drawer\s+summary/]) {
    assert.equal(dead.test(sheet), false, `"${dead.source}" still styles markup the panels no longer write`);
  }
});

test("the panel bridge and the column's old surface rule are gone together", () => {
  // These two only ever made sense as a pair. `.hud section` gave every surface in
  // the column a background, a radius and 1rem of padding; `.hud .kom-panel`
  // existed for no other reason than to take that padding back off the primitive
  // it out-specified. While the first dressed panels, deleting the second
  // double-padded them; while the second zeroed padding, deleting the first
  // changed nothing visible. So they had to leave in one commit, and the only way
  // to keep them gone is to assert both absences rather than describe the plan in
  // a comment — which is what the bridge's own comment did for two rounds.
  assert.equal(/\.hud\s+section(?![\w-])/.test(sheet), false, ".hud section is dressing the column's panels again");
  assert.equal(/\.hud\s+\.kom-panel(?![\w-])/.test(sheet), false, "the .hud .kom-panel bridge is back in styles.css");
  // What replaced them. A per-panel `margin-top` would space the column too, and
  // is exactly what came off, so the replacement is asserted positively: the
  // column is a flex column and the 16px gap is the 1rem the margin used to be.
  assert.match(sheet, /\.kingdom-column\s*\{[^}]*display:\s*flex[^}]*gap:\s*var\(--kom-space-6\)/,
    "the kingdom column must own the rhythm the bridge's margin used to hand out");
  // And the trap that made the bridge fragile, kept as a law now that the bridge
  // is not there to be out-specified: `.hud` plus a panel's own class is (0,2,0)
  // and beats every selector the primitive can write for itself.
  for (const name of ["city-panel", "logistics-panel", "army-panel", "espionage-panel", "alliance-panel", "diplomacy-panel", "events-panel", "archive-panel"]) {
    assert.equal(new RegExp(`\\.hud\\s+\\.${name}(?![\\w-])`).test(sheet), false,
      `.hud .${name} out-specifies the panel primitive`);
  }
});

test("the layout layer holds no colour literal", () => {
  // Same rule PR2 put on the primitives: colours live in the token layer, and a
  // literal here is a colour the palette cannot restyle.
  assert.equal(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(sheet), false);
});

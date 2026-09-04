import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  bandFor, bandForMatches, bandQueries, defaultSurfaces, layoutBands, layoutBreakpoints, openSurface, shellClass,
  surfaceElementIds, surfaceIds, toggleSurface, type SurfaceState,
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

test("revealing a surface is not toggling it, and never closes the one asked for", () => {
  // A row in the activity feed that points at the city panel has to make sure the
  // kingdom column is open. `toggleSurface` would have closed it in every band
  // where it already was — which is every band the feed is visible in by default
  // — so the jump would have hidden the panel it was scrolling to.
  for (const band of layoutBands) {
    for (const id of surfaceIds) {
      assert.equal(openSurface(allOpen, id, band), allOpen, `${band}/${id} reopened an open surface`);
      assert.equal(openSurface({ kingdom: false, activity: false }, id, band)[id], true, `${band}/${id} did not open`);
    }
  }
  // Identity, not just equality: the shell holds this in `useState`, so returning
  // a fresh object with the same fields would re-render the whole Situation Room
  // on every feed click that had nothing to open.
  const already: SurfaceState = { kingdom: true, activity: false };
  assert.equal(openSurface(already, "kingdom", "wide"), already);
  // Compact is still one-at-a-time: revealing the kingdom column from a feed row
  // closes the feed, which is the surface currently covering the map.
  assert.deepEqual(openSurface({ kingdom: false, activity: true }, "kingdom", "compact"), { kingdom: true, activity: false });
  // Above compact both are tracks, so revealing one leaves the other alone.
  for (const band of ["medium", "wide"] as const) {
    assert.deepEqual(openSurface({ kingdom: false, activity: true }, "kingdom", band), { kingdom: true, activity: true });
    assert.deepEqual(openSurface({ kingdom: true, activity: false }, "activity", band), allOpen);
  }
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

test("the activity column's placeholder CSS left with the placeholder", () => {
  // The column shipped as a flat, static skeleton, and the rules said so in a
  // comment: a shimmer "would animate fake content". `activity.ts` derives real
  // rows now, so the skeleton is markup nothing writes — and its `li` rule was one
  // of the bare-element selectors that outranks the primitives, so leaving it
  // behind would have restyled the real list items the feed does write.
  for (const name of ["activity-skeleton", "activity-skeleton__dot", "activity-skeleton__line"]) {
    assert.equal(selector(name).test(sheet), false, `.${name} is still in styles.css`);
  }
  // Positively: every class the feed emits has a rule, so a row cannot be styled
  // by nothing at all.
  for (const name of ["activity-list", "activity-row", "activity-row__jump", "activity-row__static", "activity-row__text",
    "activity-row__meta", "activity-empty"]) {
    assert.match(sheet, selector(name), `.${name} has no rule in styles.css`);
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

test("the tray's reserved slot left with the emptiness it reserved", () => {
  // `.command-tray__reserved` was a label in an empty half plus a `display: none`
  // that hid even the label below 1024px, so the band where the kingdom column is
  // a flyout over the map was the band where the tray said nothing at all. Two
  // rules, in two places — the base one and its promotion inside the 1024px query
  // — which is exactly the shape that survives a rewrite: delete the markup, leave
  // a rule behind, and the next person to grep the sheet concludes the slot is
  // still there.
  for (const name of ["command-tray__reserved",
    // The floating inspector's own class, and the three shapes hanging off it. All
    // four were bare-element selectors over the primitives: `.map-inspector button`
    // is (0,1,1) and took the padding straight back off `.kom-btn--compact`, which
    // is the failure the tray's buttons would have shown first.
    "map-inspector", "map-inspector-actions", "map-inspector-hint",
    // Renamed rather than deleted: `.recruit-choice` is `.modal-choice`, because
    // the tray's merge dialog asks the same question in the same shape.
    "recruit-choice"]) {
    assert.equal(selector(name).test(sheet), false, `.${name} is still in styles.css`);
  }
  // Positively: every class the tray emits has a rule.
  for (const name of ["command-tray", "command-tray__context", "command-tray__detail", "command-tray__commands",
    "command-tray__group", "command-tray__group-title", "command-tray__hint", "modal-choice"]) {
    assert.match(sheet, selector(name), `.${name} has no rule in styles.css`);
  }
  // The height law, and the only part of it a text scan can hold. The tray shares
  // a grid row with the map and the map's box is what Pixi sizes its canvas from,
  // so anything here that can reach a second line resizes the renderer. The
  // primitive stacks a blocked button *above* its reason; inside the tray that
  // stack is flipped to a row, and both the reason and its wrapper are allowed to
  // shrink — a flex item's automatic minimum is its min-content width, which for
  // `nowrap` text is the whole sentence.
  const gate = bodies("command-tray__commands");
  assert.ok(gate.some(body => /flex-direction:\s*row/.test(body)), "a gated tray button would lay its reason out on a second line");
  assert.ok(gate.filter(body => /min-width:\s*0/.test(body)).length >= 2, "the tray's gate and its reason must both be allowed to shrink");
  for (const name of ["command-tray__detail", "command-tray__hint"]) {
    assert.ok(bodies(name).some(body => /text-overflow:\s*ellipsis/.test(body) && /white-space:\s*nowrap/.test(body)),
      `.${name} can wrap onto a second line and take the map's height with it`);
  }
});

test("the chrome's old shapes left with the markup that wore them", () => {
  // Four rules, four different reasons to be gone. `.hud-frozen` faded controls
  // that a `<fieldset disabled>` now actually disables. `.link-button` dressed the
  // logout `<button>` that is a `Button` now. `.scores` had outlived its markup
  // entirely. And the two `button:focus-visible` selectors existed only because the
  // toolbar and the tray still wrote raw `<button>`s — none left, so a ring for one
  // is a ring for markup nobody writes, sitting at (0,1,1) over the primitive.
  for (const name of ["hud-frozen", "link-button", "scores"]) {
    assert.equal(selector(name).test(sheet), false, `.${name} is still in styles.css`);
  }
  for (const dead of [/\.map-toolbar\s+button/, /\.command-tray\s+button/]) {
    assert.equal(dead.test(sheet), false, `"${dead.source}" styles a raw <button> the client no longer writes`);
  }
  // Positively: every class the chrome emits has a rule. A toast that stacks, a
  // fieldset that shrinks, a labelled login field, the header's two new rows.
  for (const name of ["toast-layer", "toast__text", "toast__close", "kingdom-column__panels", "login-field",
    "brand__line", "season__score"]) {
    assert.match(sheet, selector(name), `.${name} has no rule in styles.css`);
  }
});

test("a column scrolls, and the panels inside it keep their own height", () => {
  // The bug this holds shut, measured in a browser: both columns are flex columns
  // that scroll, and `.kom-panel` sets `overflow: hidden`, which makes a panel's
  // automatic minimum size 0. So every panel was a shrinkable item in a container
  // shorter than its content, and the browser squashed all of them to fit — the
  // column's `scrollHeight` came out exactly equal to its `clientHeight` (nothing
  // left to scroll) and each panel clipped its own content. The onboarding panel
  // measured 67px of a 445px checklist, and its "Đi tới" buttons were on the page,
  // measurable, and painted nowhere: a click at one landed on the column behind it.
  // A panel is content, not space to be distributed.
  const holdsHeight = (name: string): boolean =>
    [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .some(m => new RegExp(`\\.${name}\\s*>\\s*\\*`).test(m[1]!) && /flex:\s*none|flex-shrink:\s*0/.test(m[2]!));
  for (const column of ["kingdom-column", "activity-column"]) {
    const rules = bodies(column).join("\n");
    assert.match(rules, /overflow-y:\s*auto/, `.${column} must be the box that scrolls`);
    assert.match(rules, /display:\s*flex/);
    assert.ok(holdsHeight(column), `.${column} shrinks its panels instead of scrolling past them`);
  }
  // The frozen fieldset is a second parent for four of those panels, so it needs
  // the same law — its own height is what hands the overflow to the column.
  assert.ok(holdsHeight("kingdom-column__panels"), "the frozen fieldset shrinks the panels inside it");
});

test("the layout layer holds no colour literal", () => {
  // Same rule PR2 put on the primitives: colours live in the token layer, and a
  // literal here is a colour the palette cannot restyle.
  assert.equal(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(sheet), false);
});

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { iconPaths, iconViewBox } from "./ui/icon-paths.js";
import {
  buttonVariants, densities, iconNames, panelAccents, stateIcons, stateLabels, stateTokens, uiStates,
} from "./ui/tokens.js";
import { buttonClass, iconClass, panelClass, statusClass } from "./ui/variants.js";
import { allianceRoleLabels, treatyLabels, worldEventIcons, worldEventLabels, worldEventStates } from "./vocabulary.js";

// The client runner has no DOM, so the design system is asserted as text: the two
// stylesheets are read off disk and checked against the TypeScript registry that
// names the same things. That pairing is the point. A token renamed on one side
// and not the other fails here, instead of rendering an unstyled element in front
// of a player — which is the failure mode a CSS-in-strings system otherwise has
// no way to catch.

const source = (name: string): string =>
  readFileSync(new URL(`../src/styles/${name}`, import.meta.url), "utf8");
const component = (name: string): string =>
  readFileSync(new URL(`../src/ui/${name}`, import.meta.url), "utf8");

const tokens = source("tokens.css");
const primitives = source("primitives.css");

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
});
const relative = (path: string): string => path.slice(sourceRoot.length).replace(/\\/g, "/");
/** A component's own comment quoting the markup it no longer writes must not read
 *  as the markup — the same rule `vocabulary.test.ts` scans under. */
const stripSource = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const declaredVars = (css: string): Set<string> =>
  new Set([...stripComments(css).matchAll(/(--kom-[\w-]+)\s*:/g)].map((m) => m[1]!));
const referencedVars = (css: string): string[] =>
  [...stripComments(css).matchAll(/var\((--kom-[\w-]+)/g)].map((m) => m[1]!);
const selector = (name: string): RegExp => new RegExp(`\\.${name}(?![\\w-])`);

/** The opening tag of every `<Name …>` in a file, brace-aware. An `onClick` arrow
 *  carries a `>` of its own, so the tag ends at the first `>` outside every
 *  `{…}` expression — which is the difference between reading one element's props
 *  and reading the whole subtree's. */
const openingTags = (code: string, name: string): string[] => {
  const marker = `<${name}`;
  const tags: string[] = [];
  for (let start = code.indexOf(marker); start >= 0; start = code.indexOf(marker, start + 1)) {
    let depth = 0;
    for (let cursor = start + marker.length; cursor < code.length; cursor += 1) {
      const char = code[cursor];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) { tags.push(code.slice(start, cursor + 1)); break; }
    }
  }
  return tags;
};

test("colour literals live in the palette layer and nowhere else", () => {
  const marker = tokens.indexOf("PALETTE END");
  assert.ok(tokens.includes("PALETTE BEGIN") && marker > 0, "the palette markers must exist");
  const palette = stripComments(tokens.slice(0, marker));
  const semantic = stripComments(tokens.slice(tokens.indexOf("*/", marker)));
  // The palette is meant to be the one dense block of literals in the client; if
  // this count collapses, someone has moved colours back out into the rules.
  assert.ok([...palette.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba\(/g)].length > 40, "palette looks gutted");
  assert.equal(COLOUR.test(semantic), false, "semantic tokens must be var() references only");
  assert.equal(COLOUR.test(stripComments(primitives)), false, "primitives.css must hold no colour literal");
});

test("every var() reference resolves to a declared token", () => {
  const declared = new Set([...declaredVars(tokens), ...declaredVars(primitives)]);
  const missing = [...referencedVars(tokens), ...referencedVars(primitives)].filter((n) => !declared.has(n));
  assert.deepEqual([...new Set(missing)], []);
});

test("all eight semantic states declare a fill, border and text token plus a chip rule", () => {
  assert.equal(uiStates.length, 8);
  const declared = declaredVars(tokens);
  for (const state of uiStates) {
    const triple = stateTokens(state);
    for (const name of [triple.fill, triple.border, triple.text]) {
      assert.ok(declared.has(name), `${name} is not declared in tokens.css`);
    }
    assert.match(primitives, selector(`kom-status--${state}`), `.kom-status--${state} has no rule`);
  }
});

test("every class the variant builders can emit exists in primitives.css", () => {
  const emitted = new Set<string>();
  const collect = (value: string): void => {
    for (const name of value.split(" ")) if (name) emitted.add(name);
  };
  collect(panelClass({ flush: true }));
  for (const density of densities) {
    for (const accent of panelAccents) collect(panelClass({ density, accent }));
    for (const variant of buttonVariants) collect(buttonClass(variant, { density, block: true }));
  }
  for (const state of uiStates) collect(statusClass(state, { block: true }));
  collect(iconClass("sm"));
  for (const name of emitted) assert.match(primitives, selector(name), `.${name} has no rule`);
  assert.ok(emitted.size >= 26, `expected the whole surface, collected only ${emitted.size}`);
});

test("class names hard-coded in the components exist in primitives.css", () => {
  for (const file of ["Panel.tsx", "Button.tsx", "Status.tsx", "Icon.tsx"]) {
    for (const [name] of component(file).matchAll(/\bkom-[a-z0-9_-]+/g)) {
      assert.match(primitives, selector(name), `${file} asks for .${name}, which has no rule`);
    }
  }
});

test("defaults emit no modifier and options compose in a fixed order", () => {
  assert.equal(panelClass(), "kom-panel");
  assert.equal(panelClass({ density: "default" }), "kom-panel");
  assert.equal(
    panelClass({ density: "compact", accent: "violet", className: "espionage-panel" }),
    "kom-panel kom-panel--compact kom-panel--accent-violet espionage-panel",
  );
  assert.equal(buttonClass("primary"), "kom-btn kom-btn--primary");
  assert.equal(
    buttonClass("ghost", { density: "compact", block: true }),
    "kom-btn kom-btn--ghost kom-btn--compact kom-btn--block",
  );
  assert.equal(statusClass("protocol-blocked"), "kom-status kom-status--protocol-blocked");
  assert.equal(iconClass(), "kom-icon");
  assert.equal(iconClass("sm"), "kom-icon kom-icon--sm");
});

test("the UI font stack is local-only and covers Vietnamese", () => {
  const stack = /--kom-font-ui:\s*([^;]+);/.exec(tokens)?.[1] ?? "";
  assert.match(stack, /system-ui/);
  assert.match(stack, /sans-serif$/);
  // Every step in that stack ships Vietnamese; fetching a webfont for it would be
  // a render-blocking request for glyphs the player already has.
  for (const css of [tokens, primitives]) {
    assert.equal(/@import\s+url\(|@font-face|https?:\/\//.test(css), false, "no webfont may be fetched");
  }
});

test("line heights stay above the Vietnamese diacritic clipping threshold", () => {
  const leadings = [...tokens.matchAll(/--kom-leading-[\w-]+:\s*([\d.]+);/g)].map((m) => Number(m[1]));
  assert.ok(leadings.length >= 2, "expected a tight and a normal leading");
  for (const value of leadings) assert.ok(value >= 1.2, `line-height ${value} clips stacked diacritics`);
});

test("the spacing, radius, type, motion and stacking scales are complete", () => {
  const declared = declaredVars(tokens);
  const expected = [
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => `--kom-space-${n}`),
    ...["sm", "md", "lg", "xl", "pill"].map((s) => `--kom-radius-${s}`),
    ...["2xs", "xs", "sm", "md", "base", "lg", "xl", "2xl"].map((s) => `--kom-text-${s}`),
    ...["regular", "medium", "bold"].map((s) => `--kom-weight-${s}`),
    ...["fast", "base", "slow"].map((s) => `--kom-motion-${s}`),
    ...["map-overlay", "chrome", "banner", "alert", "toast", "modal"].map((s) => `--kom-z-${s}`),
    "--kom-ease-out", "--kom-edge-highlight", "--kom-focus-ring", "--kom-icon-sm", "--kom-icon-md",
  ];
  assert.deepEqual(expected.filter((name) => !declared.has(name)), []);
});

test("every named icon is a colourless single-path glyph", () => {
  assert.equal(iconViewBox, "0 0 24 24");
  assert.deepEqual(Object.keys(iconPaths).sort(), [...iconNames].sort());
  for (const name of iconNames) {
    const path = iconPaths[name];
    assert.match(path, /^M/, `${name} must open with a move command`);
    assert.ok(path.length > 8, `${name} looks empty`);
    assert.equal(COLOUR.test(path), false, `${name} must inherit currentColor`);
    assert.match(path, /^[MmLlHhVvCcSsQqTtAaZz\d\s.,-]+$/, `${name} carries a non-path token`);
  }
});

test("each state has exactly one wording and one glyph", () => {
  const labels = uiStates.map((state) => stateLabels[state]);
  // Two surfaces calling the same state different things is how a player decides
  // they are looking at two different problems.
  assert.equal(new Set(labels).size, labels.length, "two states share a wording");
  for (const label of labels) assert.ok(label.length > 0);
  for (const state of uiStates) {
    assert.ok(iconNames.includes(stateIcons[state]), `${state} maps to an unknown icon`);
  }
});

test("only the pending chip animates, and nothing animates under reduced motion", () => {
  const animated = [...primitives.matchAll(/\.kom-status--([\w-]+) \.kom-status__dot \{\s*animation:/g)];
  assert.deepEqual([...new Set(animated.map((m) => m[1]))], ["pending"]);
  assert.ok(primitives.includes("prefers-reduced-motion"), "reduced motion must be honoured");
  const reduced = primitives.slice(primitives.indexOf("prefers-reduced-motion"));
  assert.match(reduced, /animation:\s*none/);
  assert.match(reduced, /transition:\s*none/);
});

test("buttons keep a visible focus ring and a redrawn disabled state", () => {
  assert.match(primitives, /\.kom-btn:focus-visible\s*\{[^}]*box-shadow:\s*var\(--kom-focus-ring\)/);
  const disabled = /\.kom-btn:disabled[^{]*\{([^}]*)\}/.exec(primitives)?.[1] ?? "";
  assert.ok(disabled.length > 0, "the disabled rule is missing");
  // A 45%-opacity brass button is still brass and still looks pressable. The
  // shipped sheet fades every `button:disabled`, so the primitive has to say 1.
  assert.equal(/opacity:\s*([\d.]+)/.exec(disabled)?.[1] ?? "1", "1", "a faded button is not a legible gate");
  assert.match(disabled, /border:[^;]*dashed/);
  assert.match(disabled, /cursor:\s*not-allowed/);
});

// A dialog is four behaviours, not a class name, and three of the four shipped
// modals had only the markup: no trap, no Escape, no focus restore. The fix is
// worth nothing if the next modal is hand-rolled again, so the scan is the rule.

test("only ui/Modal.tsx builds a dialog", () => {
  const files = sourceFiles(sourceRoot).filter((file) => relative(file) !== "ui/Modal.tsx");
  assert.ok(files.length > 10, `expected to scan the client source tree, found ${files.length} files`);
  const offenders = (pattern: RegExp): string[] =>
    files.filter((file) => pattern.test(stripSource(readFileSync(file, "utf8")))).map(relative);
  assert.deepEqual(offenders(/role="(?:dialog|alertdialog)"/), [], "render <Modal> instead of writing role=dialog");
  // Catches the other half: a scrim and a card with the ARIA left off is still a
  // hand-rolled dialog, and a `role`-only scan would wave it through.
  assert.deepEqual(offenders(/className="modal-(?:backdrop|card)/), [], "the scrim and the card belong to the primitive");
});

test("the modal primitive names itself, traps Tab, cancels on Escape and gives focus back", () => {
  const modal = component("Modal.tsx");
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby=\{titleId\}/, "the dialog is named by its own title, not a duplicated string");
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /event\.key !== "Tab"/);
  // The cleanup has to do both jobs: an unhooked listener that forgets the focus
  // leaves the player's caret on a node that no longer exists.
  assert.match(modal, /return \(\) => \{[^}]*removeEventListener\("keydown"[^}]*\.focus\?\.\(\)/);
  const focusable = /focusableSelector = "([^"]+)"/.exec(modal)?.[1] ?? "";
  for (const control of ["button", "input", "select", "textarea", "summary"]) {
    assert.ok(focusable.split(", ").includes(control), `${control} is unreachable inside the trap`);
  }
  assert.match(focusable, /\[tabindex\]:not\(\[tabindex='-1'\]\)/, "an opted-in tabindex must cycle, an opted-out one must not");
  // The scrim, the card and the action band are the primitive's rules now. Named
  // here so the legacy-CSS sweep cannot take them along with the modals they used
  // to belong to.
  const shell = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  for (const name of ["modal-backdrop", "modal-card", "modal-actions"]) {
    assert.match(shell, selector(name), `<Modal> asks for .${name}, which has no rule`);
  }
});

// The kingdom column is the surface a player touches every minute, so it is the
// one where "assembled from the primitives" has to be a rule and not a habit.
// `EspionagePanel` is in the list because it was the migration exemplar: if the
// shape it demonstrated stops being checked, the next panel copies whatever the
// previous one drifted into. `AdvancedDrawer` is one file holding four panels —
// alliance, events, archive and diplomacy — so one entry covers all four, and it
// is the entry that made deleting the `.hud section` bridge possible: the rule
// could only go once nothing in the column needed a sheet to dress it.

const kingdomPanels = ["CityPanel.tsx", "ArmyPanel.tsx", "LogisticsPanel.tsx", "OnboardingPanel.tsx", "EspionagePanel.tsx", "AdvancedDrawer.tsx"];
const panelSource = (name: string): string =>
  stripSource(readFileSync(new URL(`../src/components/${name}`, import.meta.url), "utf8"));

test("the kingdom column's panels are assembled from the primitives", () => {
  for (const name of kingdomPanels) {
    const code = panelSource(name);
    assert.match(code, /<Panel\b/, `${name} does not render a Panel`);
    assert.match(code, /<PanelHeader\b/, `${name} writes its own header`);
    // A hand-rolled `<section>` + `<h2>` is how the four panels drifted apart in
    // the first place: each one chose its own padding, heading size and spacing.
    assert.equal(/<section\b/.test(code), false, `${name} still writes its own <section>`);
    assert.equal(/<h2\b/.test(code), false, `${name} still writes its own heading`);
    assert.equal(/<button\b/.test(code), false, `${name} still writes a raw <button>`);
    for (const [token] of code.matchAll(/\bkom-[a-z0-9_-]+/g)) {
      assert.ok(selector(token).test(primitives) || selector(token).test(readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")),
        `${name} asks for .${token}, which has no rule in either sheet`);
    }
  }
});

test("each world event has exactly one wording, one glyph and one chip", () => {
  // The mirror of "each state has exactly one wording and one glyph", for the
  // snapshot's enums rather than the design system's. TypeScript already refuses a
  // missing key — all three maps are `Record<WorldEventType, …>` — so what is left
  // to catch is the pair that renders identically: two events sharing a wording, or
  // a label that is still the protocol key. `mob_migration` was on screen for two
  // phases, and the drawer and the activity feed both read these maps, so a second
  // spelling would put two names on one event.
  const kinds = Object.keys(worldEventLabels) as Array<keyof typeof worldEventLabels>;
  const sorted = kinds.slice().sort();
  assert.ok(kinds.length > 0, "no world events are named at all");
  assert.deepEqual(Object.keys(worldEventIcons).sort(), sorted, "the icon map covers a different set of events");
  assert.deepEqual(Object.keys(worldEventStates).sort(), sorted, "the chip map covers a different set of events");
  const labels = kinds.map((kind) => worldEventLabels[kind]);
  assert.equal(new Set(labels).size, labels.length, "two world events share a wording");
  for (const kind of kinds) {
    assert.ok(worldEventLabels[kind].length > 0, `${kind} has an empty wording`);
    assert.ok(iconNames.includes(worldEventIcons[kind]), `${kind} maps to an unknown icon`);
    assert.ok(uiStates.includes(worldEventStates[kind]), `${kind} maps to an unknown state`);
    assert.equal(/^[a-z][a-z_]*$/.test(worldEventLabels[kind]), false, `${kind} is still labelled with its protocol key`);
  }
  // The other two enums a player used to read raw, held to the same two rules.
  for (const [enumName, map] of [["treaty type", treatyLabels], ["alliance role", allianceRoleLabels]] as const) {
    const words = Object.values(map);
    assert.equal(new Set(words).size, words.length, `two ${enumName} values share a wording`);
    for (const word of words) {
      assert.ok(word.length > 0, `a ${enumName} wording is empty`);
      assert.equal(/^[a-z][a-z_]*$/.test(word), false, `a ${enumName} label is still a protocol key`);
    }
  }
  // And the drawer has to reach the player *through* those maps. `{event.eventType}`
  // in JSX is exactly how the raw key got on screen, so the shape is banned rather
  // than the symptom described: every read of one of these fields is an index.
  const drawer = panelSource("AdvancedDrawer.tsx");
  for (const field of ["eventType", "treatyType", "role"]) {
    assert.equal(new RegExp(`\\{\\s*\\w+\\.${field}\\s*\\}`).test(drawer), false,
      `AdvancedDrawer renders a raw ${field} instead of its wording`);
  }
  for (const map of ["worldEventLabels", "worldEventIcons", "worldEventStates", "treatyLabels", "allianceRoleLabels"]) {
    assert.match(drawer, new RegExp(`${map}\\[`), `the drawer does not use ${map}`);
  }
});

test("a control that issues an order shows the state of that order beside it", () => {
  // The pending strip at the bottom of the column is a summary, not a status: at
  // 288px it is below the fold, and in the compact band the whole column is
  // closed. So each control that can issue an order carries its own chip.
  for (const name of ["CityPanel.tsx", "ArmyPanel.tsx", "LogisticsPanel.tsx", "OnboardingPanel.tsx"]) {
    assert.match(panelSource(name), /<PendingChip\b/, `${name} issues orders with no visible status`);
  }
  const chip = panelSource("PendingChip.tsx");
  assert.match(chip, /pendingFor\(/, "the chip must match one command, not any command of that kind");
  assert.match(chip, /state="pending"/);
  assert.match(chip, /state="uncertain"/);
});

test("every gated button carries the reason it is gated", () => {
  // `disabled` without `reason` is the failure this whole pass exists to remove:
  // a dead control with no sentence beside it, which a player reads as a broken
  // game rather than as a rule they have not met yet. A disabled button is also
  // out of the tab order, so the reason has to be text, not a tooltip.
  const offenders: string[] = [];
  let scanned = 0;
  for (const file of sourceFiles(sourceRoot)) {
    for (const tag of openingTags(stripSource(readFileSync(file, "utf8")), "Button")) {
      scanned += 1;
      if (/\bdisabled=/.test(tag) && !/\breason=/.test(tag)) offenders.push(`${relative(file)}: ${tag.replace(/\s+/g, " ").slice(0, 72)}`);
    }
  }
  assert.deepEqual(offenders, []);
  // A brace-aware scan that silently matched nothing would pass this test for the
  // wrong reason, so the count is asserted too.
  assert.ok(scanned > 20, `expected to read the column's buttons, read ${scanned}`);
});


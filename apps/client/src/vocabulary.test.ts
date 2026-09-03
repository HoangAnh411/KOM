import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import { resourceSchema } from "@kingdoms/shared";
import { armyLabel, formatCargo, formatCost, formationLabels, formatResources, npcLabels, resourceKeys, resourceLabels, unitLabel } from "./vocabulary.js";

// Two halves, and the second is the one that keeps the first true. The registry is
// paired against `resourceSchema` — the shape the server actually sends — so a new
// resource cannot ship without a Vietnamese word for it. Then the client source is
// read as text to prove no panel has quietly gone back to spelling prices itself,
// which is the defect this module exists to end: three panels, three spellings
// (`{cost.wood}g`, `hàng {cargo.wood}g/`), and a header that printed `wood`.

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
});

/** Comments first: this file's own header quotes the strings it bans, and so does
 *  `vocabulary.ts`. A comment explaining a defect must not be read as the defect. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

/** `{rule.cost.wood}g` — an interpolation that ends in a resource key with a unit
 *  letter glued to the closing brace. In an attribute the brace is followed by a
 *  space, `/` or `>`, so this only ever matches text a player reads. */
const abbreviatedPrice = /\.(?:food|wood|stone|iron)\}[a-zA-Zđ]/u;

/** The labels themselves, as standalone words: "Đánh bại" and "Mỏ đá" are not
 *  `resourceLabels.stone` restated, "Đá" is. */
const restatedLabel = new RegExp(`(?<!\\p{L})(?:${Object.values(resourceLabels).join("|")})(?!\\p{L})`, "u");

test("every resource the server can send has exactly one Vietnamese label", () => {
  // `Record<ResourceKey, string>` makes a missing label a compile error; this makes
  // an *added* schema field one too, in the only place that would otherwise notice
  // when a player sees `mana: 12`.
  assert.deepEqual(resourceKeys, Object.keys(resourceSchema.shape), "label order must follow the API's field order");
  const labels = resourceKeys.map(key => resourceLabels[key]);
  assert.equal(new Set(labels).size, labels.length, "two resources share a wording");
  for (const label of labels) assert.ok(label.length > 0 && !/^[a-z]+$/.test(label), `${label} is not a Vietnamese word`);
});

test("a bundle has one spelling: zeros dropped, order fixed, one separator", () => {
  assert.equal(formatResources({ wood: 150, stone: 80, iron: 0 }, "—"), "150 Gỗ · 80 Đá");
  // Display order comes from the registry, not from the order the caller happened
  // to build the object in — otherwise the same cost reads two ways.
  assert.equal(formatResources({ iron: 5, food: 2 }, "—"), "2 Lương thực · 5 Sắt");
  assert.equal(formatResources({ food: 1, wood: 2, stone: 3, iron: 4 }, "—"), "1 Lương thực · 2 Gỗ · 3 Đá · 4 Sắt");
});

test("an empty bundle is named by what it means, not by an empty string", () => {
  // A free building and an empty caravan are different facts; both used to render
  // as "0g 0đ 0s".
  assert.equal(formatCost({}), "Miễn phí");
  assert.equal(formatCost({ food: 0, wood: 0, stone: 0, iron: 0 }), "Miễn phí");
  assert.equal(formatCargo({}), "Không có hàng");
  assert.equal(formatCargo({ wood: 0, stone: 10, iron: 0 }), "10 Đá");
});

test("no component spells a price itself", () => {
  const files = sourceFiles(sourceRoot);
  assert.ok(files.length > 10, `expected to scan the client source tree, found ${files.length} files`);
  const offenders = files.filter(file => abbreviatedPrice.test(stripComments(readFileSync(file, "utf8"))));
  assert.deepEqual(offenders.map(file => file.slice(sourceRoot.length)), [], "use formatCost/formatCargo instead of a hand-written unit");
});

test("only vocabulary.ts names a resource", () => {
  const offenders = sourceFiles(sourceRoot)
    .filter(file => !file.endsWith("vocabulary.ts"))
    .filter(file => restatedLabel.test(stripComments(readFileSync(file, "utf8"))));
  assert.deepEqual(offenders.map(file => file.slice(sourceRoot.length)), [], "read the label from resourceLabels");
});

/** A second copy of a registry, in the shape one is always written in: an enum
 *  member mapped to a string. `mob_migration:` and `raider_defeated:` do not
 *  match — the word has to be the whole key. */
const secondRegistry = /(?<![\w])(?:line|wedge|square|raider|migration)\s*:\s*"/;

test("an army has one name and one order, on every surface that names it", () => {
  // Four surfaces name an army: the panel, the battle report, the command tray and
  // the activity feed. Two of them used to disagree twice over — `square` was the
  // shape "Vuông" in the picker and the purpose "phòng ngự" in the report, for the
  // same order, and a raider was "Băng cướp" in one place and "Bọn cướp" in another.
  for (const registry of [formationLabels, npcLabels]) {
    const labels = Object.values(registry);
    assert.equal(new Set(labels).size, labels.length, "two keys of one enum share a wording");
    for (const label of labels) assert.match(label, /^\p{Lu}/u, `"${label}" is not written as a Vietnamese noun`);
  }
  // Ownership decides the name, not the unit type: a raider band is never "Bộ binh",
  // because a player reading that would go looking for whose it is.
  assert.equal(armyLabel({ unitType: "infantry", npcKind: "raider" }), npcLabels.raider);
  assert.equal(armyLabel({ unitType: "infantry" }), unitLabel("infantry"));
  assert.notEqual(unitLabel("infantry"), unitLabel("cavalry"));
  const files = sourceFiles(sourceRoot);
  const dead = files.filter(file => /Vuông|Bọn cướp/.test(stripComments(readFileSync(file, "utf8"))));
  assert.deepEqual(dead.map(file => file.slice(sourceRoot.length)), [], "a replaced spelling is back in the source");
  const duplicates = files
    .filter(file => !file.endsWith("vocabulary.ts"))
    .filter(file => secondRegistry.test(stripComments(readFileSync(file, "utf8"))));
  assert.deepEqual(duplicates.map(file => file.slice(sourceRoot.length)), [], "read the wording from vocabulary.ts");
});

test("both guards catch what they are for", () => {
  // Without this the two scans above would keep passing if the patterns silently
  // stopped matching — which is exactly what happened to the wording they replace.
  assert.ok(abbreviatedPrice.test("Xây · {rule.cost.wood}g {rule.cost.stone}đ"));
  assert.ok(abbreviatedPrice.test("` · hàng ${caravan.cargo.wood}g/${caravan.cargo.stone}đ`"));
  assert.ok(abbreviatedPrice.test("Chi phí: {unitCost.iron}s"));
  // A resource read into an attribute or a computation is not a spelling.
  assert.equal(abbreviatedPrice.test("<input value={cargo.wood} onChange={onChange} />"), false);
  assert.equal(abbreviatedPrice.test("if (cost.wood > city.resources.wood) return false;"), false);
  assert.ok(restatedLabel.test('<span>Gỗ</span>'));
  assert.ok(restatedLabel.test('{ food: "Lương thực" }'));
  // Words that merely start with a label stay legal, or `nodeNames` and every
  // "Đánh bại" in the onboarding list would be an offence.
  assert.equal(restatedLabel.test('{ stone: "Mỏ đá", iron: "Mỏ sắt" }'), false);
  assert.equal(restatedLabel.test('raider_defeated: { label: "Đánh bại kẻ cướp" }'), false);
  // And the registry guard: the shape of a duplicated map, not any mention of a key.
  assert.ok(secondRegistry.test('const formationNames = { line: "Hàng ngang", square: "Vuông" };'));
  assert.ok(secondRegistry.test('{ raider: "Bọn cướp" }'));
  assert.equal(secondRegistry.test('mob_migration: "Loạn quân di cư"'), false);
  assert.equal(secondRegistry.test('raider_defeated: { state: "success" }'), false);
  assert.equal(secondRegistry.test('if (army.npcKind === "raider") return npcLabels.raider;'), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { iconNames } from "./ui/tokens.js";
import { CHIP_TEXT_ZOOM, CHIP_VALUE_ZOOM, chipFor, labelTextFor, type ChipEntity, type ChipPlan } from "./world-3d/label-chips.js";

// The chip ladder is what took the sentences off the map, so the ladder itself
// is the thing to hold: same entity, three zooms, three different amounts of
// ink — and never a sentence at a zoom where the entity is a few pixels tall.

const ownArmy: ChipEntity = { kind: "army", strength: 240, own: true };
const ownCity: ChipEntity = { kind: "city", name: "Thành Đông", own: true, unknown: false };

/** `assert.equal` cannot narrow the union, so a failing mode check has to fail
 *  the test instead of handing the caller a dot it will read as a chip. */
const asChip = (plan: ChipPlan) => plan.mode === "chip" ? plan : assert.fail(`expected a chip, got a ${plan.mode}`);

test("the zoom ladder is ordered and non-empty", () => {
  assert.ok(CHIP_VALUE_ZOOM > 0);
  assert.ok(CHIP_TEXT_ZOOM > CHIP_VALUE_ZOOM);
});

test("far zoom collapses every entity to a tone-only dot", () => {
  const entities: ChipEntity[] = [ownArmy, ownCity, { kind: "mission", title: "Tiêu diệt bãi sinh vật" }, { kind: "hub", name: "Chợ Trung" }];
  for (const entity of entities) {
    const plan = chipFor(entity, 0.05, "chip");
    assert.equal(plan.mode, "dot", `${entity.kind} should be a dot at far zoom`);
  }
});

test("an own army keeps its strength number once the chip appears", () => {
  const mid = asChip(chipFor(ownArmy, CHIP_VALUE_ZOOM, "chip"));
  assert.equal(mid.icon, "sword");
  assert.equal(mid.value, "240");
  assert.equal(mid.text, null, "the army has no name worth ink");
  assert.equal(mid.tone, "own");
});

test("a city's name arrives only past the text zoom, and unknown cities never get one", () => {
  const mid = asChip(chipFor(ownCity, CHIP_VALUE_ZOOM, "chip"));
  assert.equal(mid.text, null, "no names mid-zoom");
  const near = asChip(chipFor(ownCity, CHIP_TEXT_ZOOM, "chip"));
  assert.equal(near.text, "Thành Đông");
  const unknown = asChip(chipFor({ kind: "city", name: "", own: false, unknown: true }, CHIP_TEXT_ZOOM, "chip"));
  assert.equal(unknown.text, null, "an unscouted city has no name to show");
  assert.equal(unknown.tone, "neutral");
});

test("the compact style drops names even at full zoom, the dot style drops everything", () => {
  assert.equal(asChip(chipFor(ownCity, 5, "chip-compact")).text, null);
  assert.equal(chipFor(ownCity, 5, "dot").mode, "dot");
  assert.equal(chipFor(ownArmy, 5, "dot").mode, "dot");
});

test("every glyph a chip can ask for exists in the icon registry", () => {
  const entities: ChipEntity[] = [
    ownArmy, ownCity,
    { kind: "caravan", own: true },
    { kind: "mission", title: "Trinh sát" },
    { kind: "hub", name: "Chợ Trung" },
    { kind: "node", resourceType: "wood" }, { kind: "node", resourceType: "stone" },
    { kind: "node", resourceType: "food" }, { kind: "node", resourceType: "iron" },
    { kind: "seat", heldBy: "own" }, { kind: "seat", heldBy: "other" }, { kind: "seat", heldBy: "none" },
  ];
  for (const entity of entities) {
    const plan = chipFor(entity, 5, "chip");
    assert.equal(plan.mode, "chip", `${entity.kind} should have a chip at full zoom`);
    if (plan.mode === "chip") assert.ok(iconNames.includes(plan.icon), `${entity.kind} asks for an unregistered icon`);
  }
});

test("resource nodes mirror the resource glyph they stand for", () => {
  assert.equal(asChip(chipFor({ kind: "node", resourceType: "wood" }, 5, "chip")).icon, "wood");
  assert.equal(asChip(chipFor({ kind: "node", resourceType: "iron" }, 5, "chip")).icon, "iron");
});

test("seats carry allegiance, missions carry the mission tone", () => {
  assert.equal(asChip(chipFor({ kind: "seat", heldBy: "own" }, 5, "chip")).tone, "own");
  assert.equal(asChip(chipFor({ kind: "seat", heldBy: "none" }, 5, "chip")).tone, "neutral");
  const mission = asChip(chipFor({ kind: "mission", title: "X" }, 5, "chip"));
  assert.equal(mission.tone, "mission");
  assert.equal(mission.icon, "map-pin");
});

test("labelTextFor gives hover tooltips the words the chips removed", () => {
  assert.equal(labelTextFor(ownCity), "Thành Đông");
  assert.ok(labelTextFor(ownArmy).includes("240"), "the tooltip must still state the strength");
  assert.equal(labelTextFor({ kind: "city", name: "", own: false, unknown: true }), "Thành chưa xác định");
  const entities: ChipEntity[] = [ownArmy, { kind: "caravan", own: false }, { kind: "node", resourceType: "stone" }, { kind: "seat", heldBy: "other" }];
  for (const entity of entities) {
    assert.ok(labelTextFor(entity).length > 0, `${entity.kind} has no tooltip wording`);
  }
});

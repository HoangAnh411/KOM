import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gameRules, regions } from "@kingdoms/shared";
import type { Army, City, ResourceNode, WorldSnapshot } from "@kingdoms/shared";
import type { MapSelection } from "./map.js";
import type { InteractionMode } from "./state.js";
import {
  panelForSelection, trayCommandLimit, trayGroups, traySubject, type TrayCommand, type TrayGroup,
} from "./tray-groups.js";
import { iconNames } from "./ui/tokens.js";
import { frozenReason } from "./validation.js";
import { armyLabel, formationLabels, resourceLabels } from "./vocabulary.js";

// The tray's right half was an empty slot with a label in it. What it holds now is
// a pure table — selection in, commands out — and this file is where that table's
// rules live rather than in the markup that renders it.
//
// Three of the rules are the ones a player would notice breaking, and none of them
// is visible in `CommandTray.tsx`:
//
//   1. A command the player cannot run is *disabled with a reason*, never dropped.
//      A missing button reads as a missing feature, and that is the failure mode
//      the whole `{ ok, reason }` convention exists to prevent.
//   2. Someone else's army and someone else's city are information. Offering
//      "Tấn công" on a foe's army would issue an order their army cannot carry out.
//   3. Nothing the tray builds can make it taller. It shares a grid row with the
//      map, and the map's box is what Pixi sizes its canvas from — so the number of
//      commands is capped and the words in them are short, checked here because a
//      bare `node --test` cannot measure a pixel.

const ME = "player-me";
const FOE = "player-foe";
const IDLE: InteractionMode = { kind: "idle" };

const city = (over: Partial<City> = {}): City => ({
  id: "city-me", playerId: ME, playerName: "Ember", name: "Hoa Lư", x: 5, y: 5,
  resources: { food: 200, wood: 200, stone: 200, iron: 200 },
  buildings: { town_hall: 1 }, queues: [], ...over,
});

const foeCity = (over: Partial<City> = {}): City =>
  city({ id: "city-foe", playerId: FOE, playerName: "Rival", name: "Cổ Loa", x: 12, y: 12, ...over });

const army = (over: Partial<Army> = {}): Army => ({
  id: "army-me", ownerType: "player", ownerPlayerId: ME, x: 6, y: 7, unitType: "infantry",
  strength: 120, morale: 80, formation: "line", supply: 100, ...over,
});

const foeArmy = (over: Partial<Army> = {}): Army =>
  army({ id: "army-foe", ownerPlayerId: FOE, x: 9, y: 9, ...over });

const node = (over: Partial<ResourceNode> = {}): ResourceNode => ({
  id: "node-1", kingdomId: "kingdom-1", regionId: "region-1", x: 3, y: 4,
  resourceType: "wood", remaining: 400, capacity: 800, recoveryRate: 5, ...over,
});

const world = (over: Partial<WorldSnapshot> = {}): WorldSnapshot => ({
  protocolVersion: 1,
  kingdom: { id: "kingdom-1", name: "Meridian" },
  season: { id: "season-1", status: "ACTIVE", endsAt: "2026-09-03T00:00:00.000Z" },
  cities: [city(), foeCity()],
  caravans: [], armies: [], heroes: [], scores: {}, factionCatalog: {},
  logistics: { resourceNodes: [], depots: [], tradeRoutes: [], marketHubs: [], throughput: {} },
  ...over,
});

/** One group, always: the tray shows the commands for one subject, and a second
 *  group would be a second row. */
const only = (selection: MapSelection | undefined, snapshot: WorldSnapshot | undefined = world(), interaction: InteractionMode = IDLE): TrayGroup => {
  const groups = trayGroups(selection, interaction, snapshot, ME);
  assert.equal(groups.length, 1, `expected one group, got ${groups.length}`);
  return groups[0]!;
};

const byId = (group: TrayGroup, id: string): TrayCommand => {
  const command = group.commands.find(item => item.id === id);
  assert.ok(command, `group ${group.id} has no "${id}" command — the tray must disable it, not drop it`);
  return command;
};

/** Every selection the map can hand over, including the two that arrive as a
 *  snapshot retires the thing under the player's cursor. */
const everySelection = (): { name: string; selection: MapSelection | undefined; snapshot: WorldSnapshot }[] => {
  const snapshot = world({ armies: [army(), foeArmy()], logistics: { ...world().logistics, resourceNodes: [node()] } });
  return [
    { name: "nothing", selection: undefined, snapshot },
    { name: "own army", selection: { kind: "army", id: "army-me" }, snapshot },
    { name: "foe army", selection: { kind: "army", id: "army-foe" }, snapshot },
    { name: "own city", selection: { kind: "city", id: "city-me" }, snapshot },
    { name: "foe city", selection: { kind: "city", id: "city-foe" }, snapshot },
    { name: "resource node", selection: { kind: "tile", x: 3, y: 4 }, snapshot },
    { name: "empty tile", selection: { kind: "tile", x: 18, y: 18 }, snapshot },
    { name: "vanished army", selection: { kind: "army", id: "army-ghost" }, snapshot },
    { name: "vanished city", selection: { kind: "city", id: "city-ghost" }, snapshot },
  ];
};

test("every selection produces exactly one group, and none of them is silent", () => {
  for (const { name, selection, snapshot } of everySelection()) {
    const group = only(selection, snapshot);
    assert.ok(group.id.length > 0, `${name}: group has no id`);
    assert.ok(group.title.length > 0, `${name}: group has no title`);
    assert.ok(iconNames.includes(group.icon), `${name}: "${group.icon}" is not a glyph Icon can draw`);
    // The tray is never blank. A selection with nothing to press says why instead,
    // which is the difference between "no commands here" and "this is broken".
    assert.ok(group.commands.length > 0 || (group.hint?.length ?? 0) > 0, `${name}: neither a command nor a sentence`);
    const ids = group.commands.map(command => command.id);
    assert.equal(new Set(ids).size, ids.length, `${name}: two commands share the React key`);
  }
});

test("a command the player cannot run is disabled with a reason, never dropped", () => {
  // A frozen army is the strongest case: all four of its orders are blocked at
  // once, so a builder that filtered on `ok` would render an empty group and the
  // player would read the freeze as the game losing its army controls.
  const group = only({ kind: "army", id: "army-me" }, world({ armies: [army({ frozen: true })] }));
  assert.equal(group.commands.length, 4);
  for (const command of group.commands) {
    assert.equal(command.check.ok, false, `${command.id} is not blocked for a frozen army`);
    assert.match(command.check.reason ?? "", /đóng băng/, `${command.id} is blocked without saying why`);
  }
  for (const { name, selection, snapshot } of everySelection()) {
    for (const command of only(selection, snapshot).commands) {
      if (command.check.ok) assert.equal(command.check.reason, undefined, `${name}/${command.id} is allowed and still explains itself`);
      else assert.ok((command.check.reason?.length ?? 0) > 10, `${name}/${command.id} is blocked with nothing to read`);
    }
  }
});

test("your own army gets all four orders, each gated by its own condition", () => {
  const alone = only({ kind: "army", id: "army-me" }, world({ armies: [army()] }));
  assert.deepEqual(alone.commands.map(command => command.label), ["Di chuyển", "Tấn công", "Hợp nhất", "Hủy lệnh"]);
  assert.equal(byId(alone, "move").check.ok, true, "an army of your own can always be told to walk");
  // Nothing to attack, nobody to merge with, no order to cancel — three different
  // sentences, because the same wording three times sends the player looking for
  // one problem when there are three.
  const blocked = ["attack", "merge", "cancel-order"].map(id => byId(alone, id).check);
  assert.deepEqual(blocked.map(check => check.ok), [false, false, false]);
  assert.equal(new Set(blocked.map(check => check.reason)).size, 3, "two blocked orders share a sentence");

  assert.equal(byId(only({ kind: "army", id: "army-me" }, world({ armies: [army(), foeArmy()] })), "attack").check.ok, true);
  // A rival's army that is already destroyed or frozen is not a target.
  for (const gone of [foeArmy({ strength: 0 }), foeArmy({ frozen: true })]) {
    const group = only({ kind: "army", id: "army-me" }, world({ armies: [army(), gone] }));
    assert.equal(byId(group, "attack").check.ok, false, `${gone.id} should not count as an enemy in sight`);
  }
  assert.equal(byId(only({ kind: "army", id: "army-me" }, world({ armies: [army({ targetX: 9, targetY: 9 })] })), "cancel-order").check.ok, true);
});

test("merge is offered only with a partner, and hands the partners to the dialog", () => {
  const partner = army({ id: "army-second", strength: 60 });
  const merge = byId(only({ kind: "army", id: "army-me" }, world({ armies: [army(), partner] })), "merge");
  assert.equal(merge.check.ok, true);
  // The candidates travel with the intent: the modal that asks which army to fold
  // in must offer the same list the gate was decided from, or it can offer a choice
  // the server will reject.
  assert.deepEqual(merge.intent, { kind: "merge", armyId: "army-me", candidates: [partner] });
  // The three ways a nearby army is not a partner, with the cap named in the
  // reason rather than left for the player to work out from a rejection.
  for (const candidate of [
    army({ id: "army-far", x: 1, y: 1 }),
    army({ id: "army-archers", unitType: "archer" }),
    army({ id: "army-full", strength: gameRules.army.maxStrengthPerArmy }),
  ]) {
    const blocked = byId(only({ kind: "army", id: "army-me" }, world({ armies: [army(), candidate] })), "merge");
    assert.equal(blocked.check.ok, false, `${candidate.id} should not be a merge partner`);
    assert.match(blocked.check.reason ?? "", new RegExp(String(gameRules.army.maxStrengthPerArmy)));
  }
});

test("someone else's army and city are information, with the way in named", () => {
  const snapshot = world({ armies: [army(), foeArmy()] });
  const foe = only({ kind: "army", id: "army-foe" }, snapshot);
  assert.deepEqual(foe.commands, [], "a rival's army cannot carry out an order of yours");
  assert.match(foe.hint ?? "", /Tấn công/, "the hint has to say how to attack it, since the button cannot be here");
  const raider = army({ id: "army-npc", ownerType: "npc", ownerPlayerId: null, npcKind: "raider" });
  const npc = only({ kind: "army", id: "army-npc" }, world({ armies: [raider] }));
  assert.deepEqual(npc.commands, []);
  assert.notEqual(npc.title, foe.title, "an unowned band and a rival's army are not the same fact");
  const theirs = only({ kind: "city", id: "city-foe" }, snapshot);
  assert.deepEqual(theirs.commands, []);
  assert.match(theirs.hint ?? "", /Rival/, "a rival city's hint must name whose it is");
});

test("your own city is a way into the panels that command it, not a copy of them", () => {
  const group = only({ kind: "city", id: "city-me" });
  assert.deepEqual(group.commands.map(command => command.intent), [
    { kind: "panel", anchor: "city" }, { kind: "panel", anchor: "army" }, { kind: "panel", anchor: "logistics" },
  ]);
  for (const command of group.commands) assert.equal(command.check.ok, true, "a jump to a panel is never blocked");
  // Frozen changes the sentence, not the commands: the panels are still worth
  // opening, and the wording is the one every other control uses so two surfaces
  // cannot describe one freeze two ways.
  const frozen = only({ kind: "city", id: "city-me" }, world({ cities: [city({ frozen: true }), foeCity()] }));
  assert.equal(frozen.hint, frozenReason);
  assert.equal(frozen.commands.length, 3);
});

test("a tile says what is on it, and a resource node says what to do about it", () => {
  const snapshot = world({ logistics: { ...world().logistics, resourceNodes: [node()] } });
  const mine = only({ kind: "tile", x: 3, y: 4 }, snapshot);
  assert.deepEqual(mine.commands.map(command => command.intent), [{ kind: "panel", anchor: "logistics" }]);
  // Which mine and how much is left are the left half's facts — asserted there, in
  // the subject test below. What this half owes the player is the thing the left
  // half cannot say: that a mine is commanded from the logistics panel.
  assert.match(mine.hint ?? "", /Vận tải/, "the hint must name where the harvest order lives");
  const empty = only({ kind: "tile", x: 18, y: 18 }, snapshot);
  assert.deepEqual(empty.commands, []);
  assert.ok((empty.hint?.length ?? 0) > 0);
});

test("a province seat is not empty ground, and says what standing there is worth", () => {
  const seat = regions[0]!;
  const group = only({ kind: "tile", x: seat.seatX, y: seat.seatY });
  assert.notEqual(group.id, `tile-${seat.seatX}-${seat.seatY}`, "one tile in eighty decides a province — it cannot read as dirt");
  assert.match(group.title, new RegExp(seat.name), "the seat names the province it holds");
  assert.deepEqual(group.commands.map(command => command.intent), [{ kind: "panel", anchor: "army" }]);
  // The radius comes from the rules, not from a number retyped here: the placement test
  // above this file's history already drifted once by restating a constant of the rules.
  assert.match(group.hint ?? "", new RegExp(String(gameRules.territory.captureRadius)), "the hint must state the capture rule");
});

test("the left half of a tile names its province and who holds it", () => {
  const seat = regions[0]!;
  const tile: MapSelection = { kind: "tile", x: seat.seatX, y: seat.seatY };
  const unheld = traySubject(tile, world(), ME);
  assert.match(unheld.detail, new RegExp(seat.name));
  assert.match(unheld.detail, /chưa ai giữ/, "an unclaimed province says so rather than saying nothing");
  assert.match(traySubject(tile, world({ regionControl: { [seat.code]: ME } }), ME).detail, /bạn đang giữ/);
  // A rival is named by their city, the same way a rival's army is — the snapshot
  // carries only the holder's id.
  assert.match(traySubject(tile, world({ regionControl: { [seat.code]: FOE } }), ME).detail, /Rival đang giữ/);
  // Never the province code: `A` on screen is a leak of the authoring format.
  for (const held of [world(), world({ regionControl: { [seat.code]: FOE } })]) {
    const detail = traySubject(tile, held, ME).detail;
    assert.ok(!new RegExp(`\\b${seat.code}\\b`).test(detail), `the province code leaked into "${detail}"`);
  }
});

test("an order in progress replaces the selection's commands with one way to stop", () => {
  const snapshot = world({ armies: [army(), foeArmy()] });
  for (const mode of ["move", "attack"] as const) {
    const group = only({ kind: "army", id: "army-me" }, snapshot, { kind: mode, armyId: "army-me" });
    assert.deepEqual(group.commands.map(command => command.intent), [{ kind: "cancel-order" }]);
    assert.equal(group.commands[0]!.check.ok, true, "the way out of a gesture is never blocked");
    assert.match(group.hint ?? "", mode === "move" ? /Nhấp vào bản đồ/ : /Nhấp vào quân địch/);
  }
});

test("nothing the table builds can make the tray taller", () => {
  // The tray shares a grid row with the map and the map's box is what Pixi sizes
  // its canvas from, so a second row of buttons resizes the renderer. A bare
  // `node --test` cannot measure a pixel; what it can do is hold the inputs of
  // that measurement — how many buttons, and how many characters in each.
  for (const { name, selection, snapshot } of everySelection()) {
    const group = only(selection, snapshot);
    assert.ok(group.commands.length <= trayCommandLimit, `${name}: ${group.commands.length} commands will not fit one row`);
    assert.ok(group.title.length <= 26, `${name}: the title "${group.title}" is too long for the strip`);
    for (const command of group.commands) {
      assert.ok(command.label.length <= 20, `${name}: "${command.label}" is too long for a compact button`);
    }
  }
});

test("the left half names what was clicked, and gives the strength once", () => {
  const snapshot = world({ armies: [army(), foeArmy()], logistics: { ...world().logistics, resourceNodes: [node()] } });
  const subject = traySubject({ kind: "army", id: "army-me" }, snapshot, ME);
  assert.equal(subject.title, `${armyLabel(army())} · 120`);
  assert.match(subject.detail, /Của bạn/);
  assert.match(subject.detail, new RegExp(formationLabels.line), "formation decides a battle and used to be missing here");
  assert.match(subject.detail, /Nhuệ khí 80/);
  assert.match(subject.detail, /Tiếp tế 100%/);
  assert.match(subject.detail, /\(6,7\)/);
  // Once. The old inspector printed strength as a number in the title and again
  // behind a `⚔` whose meaning lived in a tooltip.
  assert.equal([...`${subject.title} ${subject.detail}`.matchAll(/120/g)].length, 1);
  // A rival's army is named by their city, the only place a snapshot spells a
  // player's name at all.
  assert.match(traySubject({ kind: "army", id: "army-foe" }, snapshot, ME).detail, /Rival/);
  assert.equal(traySubject({ kind: "city", id: "city-me" }, snapshot, ME).title, "Hoa Lư");
  // The mine's name and what is left in it: the word for the resource comes from the
  // one module allowed to name one, and the count is the fact that decides whether
  // to bother. Both live here because this is the half that identifies things — the
  // group beside it used to print them a second time.
  const mine = traySubject({ kind: "tile", x: 3, y: 4 }, snapshot, ME);
  assert.equal(mine.title, `Mỏ ${resourceLabels.wood}`);
  assert.match(mine.detail, /400\/800/);
  assert.match(traySubject({ kind: "tile", x: 18, y: 18 }, snapshot, ME).title, /18,18/);
  // Before the first snapshot, and after one retires what was selected: still a
  // sentence, because the tray is always on screen.
  for (const edge of [
    traySubject(undefined, snapshot, ME),
    traySubject({ kind: "army", id: "army-ghost" }, snapshot, ME),
    traySubject({ kind: "city", id: "city-me" }, undefined, ME),
  ]) {
    assert.ok(edge.title.length > 0 && edge.detail.length > 0);
  }
});

test("the right half says what to do, never a second copy of the left half", () => {
  // Found by looking at the strip at five viewports, which is the only way it could
  // be found: with nothing selected the tray read "Chưa chọn gì / Nhấp vào quân đội,
  // thành phố hoặc ô đất trên bản đồ." on the left and, one gap away, the same two
  // lines again on the right. Both halves are on screen at once in a 60px row and
  // both are `nowrap` + ellipsis, so a sentence printed twice spends half the room
  // the tray has to say nothing new. Two more selections did it — an army and a city
  // the latest snapshot had retired, the city's hint word for word identical to its
  // detail.
  //
  // The split: the left half names what was clicked, the right half says what can be
  // done about it. Normalised loosely on purpose — case, punctuation and runs of
  // space are not what makes two sentences the same sentence — and checked both ways
  // round, since "Ô đất" inside "Ô đất (18,18)" is the same duplication as the whole
  // string would be.
  const norm = (text: string): string =>
    text.toLowerCase().replace(/[.,·—%]/g, " ").replace(/\s+/g, " ").trim();
  const holdApart = (name: string, group: TrayGroup, subject: { title: string; detail: string }) => {
    for (const right of [group.title, group.hint ?? ""].map(norm).filter(text => text.length > 0)) {
      for (const left of [norm(subject.title), norm(subject.detail)]) {
        assert.ok(!left.includes(right) && !right.includes(left),
          `${name}: the tray prints "${right}" on both sides of one 60px strip`);
      }
    }
  };
  for (const { name, selection, snapshot } of everySelection()) {
    holdApart(name, only(selection, snapshot), traySubject(selection, snapshot, ME));
  }
  // Mid-gesture too, where the left half still shows the army being ordered about.
  const ordering = world({ armies: [army(), foeArmy()] });
  const selected: MapSelection = { kind: "army", id: "army-me" };
  for (const mode of ["move", "attack"] as const) {
    holdApart(mode, only(selected, ordering, { kind: mode, armyId: "army-me" }), traySubject(selected, ordering, ME));
  }
});

test("the map's selection marks the panel that commands it, and marks nothing otherwise", () => {
  const snapshot = world({ armies: [army(), foeArmy()], logistics: { ...world().logistics, resourceNodes: [node()] } });
  assert.equal(panelForSelection({ kind: "army", id: "army-me" }, snapshot, ME), "army");
  assert.equal(panelForSelection({ kind: "city", id: "city-me" }, snapshot, ME), "city");
  assert.equal(panelForSelection({ kind: "tile", x: 3, y: 4 }, snapshot, ME), "logistics");
  // Nothing of the player's: pulling the column to another panel would take them
  // off what they were doing to show them something they cannot command.
  for (const selection of [
    { kind: "army", id: "army-foe" }, { kind: "city", id: "city-foe" },
    { kind: "tile", x: 18, y: 18 }, { kind: "army", id: "army-ghost" },
  ] as MapSelection[]) {
    assert.equal(panelForSelection(selection, snapshot, ME), undefined);
  }
  assert.equal(panelForSelection(undefined, snapshot, ME), undefined);
  assert.equal(panelForSelection({ kind: "army", id: "army-me" }, undefined, ME), undefined);
  // A destroyed army is not a panel either — `ArmyPanel` does not list it.
  assert.equal(panelForSelection({ kind: "army", id: "army-me" }, world({ armies: [army({ strength: 0 })] }), ME), undefined);
});

test("the tray sends the army panel's command, not its own spelling of it", () => {
  const group = only({ kind: "army", id: "army-me" }, world({ armies: [army({ targetX: 1, targetY: 1 })] }));
  assert.deepEqual(byId(group, "cancel-order").intent, {
    kind: "command",
    command: { kind: "cancel_army_order", label: "Hủy lệnh", path: "/api/commands/cancel-army-order", body: { armyId: "army-me" } },
  });
  // `ArmyPanel` shows that army's pending chip keyed on the command's `kind` plus
  // `{ armyId }`. A second spelling of the same order in the tray would leave the
  // chip dark while the order is in flight, which reads as the click doing nothing
  // — the exact failure UI-3 was about. Nothing in a type can catch it, because
  // `ClientCommand.kind` is a string on both sides.
  const panel = readFileSync(new URL("../src/components/ArmyPanel.tsx", import.meta.url), "utf8");
  assert.ok(panel.includes(`kind: "cancel_army_order"`), "ArmyPanel no longer mints cancel_army_order");
  assert.ok(panel.includes(`path: "/api/commands/cancel-army-order"`), "ArmyPanel's cancel path moved");
});

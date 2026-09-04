import assert from "node:assert/strict";
import test from "node:test";
import { gameRules } from "@kingdoms/shared";
import type { Alliance, AllianceVote, Army, BattleReport, Caravan, City, SpyMission, Treaty, WorldEvent, WorldSnapshot } from "@kingdoms/shared";
import {
  activityAnchors, activityIcons, activityKindLabels, activityLimit, activityStates, attentionItems, attentionLimit,
  deriveActivity, type ActivityEvent, type ActivityKind,
} from "./activity.js";
import type { PendingCommand } from "./commands.js";
import { iconNames, uiStates } from "./ui/tokens.js";
import { formatResources, spyMissionLabels, treatyLabels, worldEventIcons, worldEventLabels, worldEventStates } from "./vocabulary.js";

// The activity column has no fetch and no timer: every row is a fact the client
// was already told, restated. That makes the whole feed a pure function, and this
// file the place where its rules are actually enforced rather than described.
//
// Three of those rules are load-bearing and none of them is visible in the markup:
// a repeated snapshot must produce no new row (they arrive every couple of
// seconds), the ring must stop growing (a six-hour session is thousands of ticks),
// and a fact must be reported from *our* side of it (the same battle report is a
// win for one player and a loss for the other). The rest of the file is one test
// per source of rows, each pinning both what it says and — more often the bug —
// when it says nothing.

const ME = "player-me";
const FOE = "player-foe";
const NOW = 1_764_000_000_000;
const AT = "2026-09-03T00:00:00.000Z";

const city = (over: Partial<City> = {}): City => ({
  id: "city-me", playerId: ME, playerName: "Ember", name: "Hoa Lư", x: 5, y: 5,
  resources: { food: 200, wood: 200, stone: 200, iron: 200 },
  buildings: { town_hall: 1 }, queues: [], ...over,
});

const foeCity = (over: Partial<City> = {}): City =>
  city({ id: "city-foe", playerId: FOE, playerName: "Rival", name: "Cổ Loa", x: 12, y: 12, ...over });

const queue = (over: Partial<City["queues"][number]> = {}): City["queues"][number] =>
  ({ id: "queue-1", type: "build", buildingId: "warehouse", targetLevel: 2, completesAt: AT, ...over });

const army = (over: Partial<Army> = {}): Army => ({
  id: "army-me", ownerType: "player", ownerPlayerId: ME, x: 6, y: 7, unitType: "infantry",
  strength: 120, morale: 80, formation: "line", supply: 100, ...over,
});

const caravan = (over: Partial<Caravan> = {}): Caravan => ({
  id: "caravan-1", ownerPlayerId: ME, sourceCityId: "city-me", destinationKind: "city",
  destinationCityId: "city-foe", progress: 0.5, status: "moving",
  cargo: { food: 0, wood: 150, stone: 80, iron: 0 }, ...over,
});

/** The cargo of `caravan()`, spelled by the module that owns resource wording. A
 *  literal "150 Gỗ · 80 Đá" here would be this file inventing a second spelling —
 *  the exact defect `vocabulary.ts` exists to end. */
const CARGO = formatResources({ wood: 150, stone: 80 }, "");

const mission = (over: Partial<SpyMission> = {}): SpyMission => ({
  id: "spy-1", kingdomId: "kingdom-1", actorPlayerId: ME, targetPlayerId: FOE, missionType: "scout",
  status: "in_progress", accuracy: 0.6, cost: { wood: 50, stone: 0, iron: 0 },
  startedAt: AT, completesAt: AT, ...over,
});

const treaty = (over: Partial<Treaty> = {}): Treaty => ({
  id: "treaty-1", kingdomId: "kingdom-1", proposerPlayerId: ME, targetPlayerId: FOE,
  treatyType: "non_aggression", status: "proposed", durationSeconds: 3600, proposedAt: AT, ...over,
});

const worldEvent = (over: Partial<WorldEvent> = {}): WorldEvent => ({
  id: "event-1", kingdomId: "kingdom-1", eventType: "plague",
  affectedTiles: [{ x: 1, y: 1 }, { x: 2, y: 2 }], modifier: { food: -0.2 },
  startsAt: AT, endsAt: AT, severity: 2, ...over,
});

const alliance: Alliance = {
  id: "alliance-1", kingdomId: "kingdom-1", name: "Đông Đô", tag: "DDO", leaderPlayerId: ME,
  members: [{ playerId: ME, role: "leader", contribution: 0, joinedAt: AT }], createdAt: AT,
};

const vote = (over: Partial<AllianceVote> = {}): AllianceVote => ({
  id: "vote-1", allianceId: "alliance-1", candidatePlayerId: FOE, openedByPlayerId: FOE,
  votes: [], status: "open", openedAt: AT, expiresAt: AT, ...over,
});

const side = (playerId: string, over: Partial<BattleReport["attacker"]> = {}): BattleReport["attacker"] => ({
  ownerType: "player", playerId, armyId: "army-me", unitType: "infantry", formation: "line",
  strengthBefore: 120, strengthAfter: 60, moraleBefore: 80, moraleAfter: 60, supplyBefore: 90, ...over,
});

const report = (over: Partial<BattleReport> = {}): BattleReport => ({
  id: "report-1", kingdomId: "kingdom-1", seasonId: "season-1", tileX: 7, tileY: 8, terrain: "plains",
  attacker: side(ME), defender: side(FOE, { armyId: "army-foe", strengthAfter: 0 }),
  rounds: [], victor: "attacker", seed: 1, resolvedAt: AT, ...over,
});

const world = (over: Partial<WorldSnapshot> = {}): WorldSnapshot => ({
  protocolVersion: 1,
  kingdom: { id: "kingdom-1", name: "Meridian" },
  season: { id: "season-1", status: "ACTIVE", endsAt: AT },
  cities: [city(), foeCity()],
  caravans: [], armies: [], heroes: [], scores: {}, factionCatalog: {},
  logistics: { resourceNodes: [], depots: [], tradeRoutes: [], marketHubs: [], throughput: {} },
  ...over,
});

/** The snapshot arm, which is where most of the feed comes from: two worlds in,
 *  the rows their difference is worth telling out. */
const diff = (previous: WorldSnapshot | undefined, next: WorldSnapshot): ActivityEvent[] =>
  deriveActivity([], { source: "snapshot", previous, next, playerId: ME }, NOW);

const kinds = Object.keys(activityKindLabels) as ActivityKind[];

test("every kind of row has exactly one wording, one glyph and one chip", () => {
  // The mirror of `ui-primitives.test.ts`'s "each state has exactly one wording and
  // one glyph", for the feed's own vocabulary. `Record<ActivityKind, …>` already
  // makes a missing entry a compile error, so what is left to catch is the pair that
  // renders identically — two kinds sharing a chip wording, or a label that is still
  // the kind's own key.
  const sorted = kinds.slice().sort();
  assert.ok(kinds.length >= 17, `expected the whole feed's vocabulary, found ${kinds.length}`);
  assert.deepEqual(Object.keys(activityIcons).sort(), sorted, "the glyph map covers a different set of kinds");
  assert.deepEqual(Object.keys(activityStates).sort(), sorted, "the chip map covers a different set of kinds");
  const labels = kinds.map(kind => activityKindLabels[kind]);
  assert.equal(new Set(labels).size, labels.length, "two kinds share a chip wording");
  for (const kind of kinds) {
    assert.ok(activityKindLabels[kind].length > 0, `${kind} has an empty wording`);
    assert.equal(/^[a-z][a-z-]*$/.test(activityKindLabels[kind]), false, `${kind} is still labelled with its own key`);
    assert.ok(iconNames.includes(activityIcons[kind]), `${kind} maps to an unknown icon`);
    assert.ok(uiStates.includes(activityStates[kind]), `${kind} maps to an unknown state`);
  }
});

test("a row becomes a control only when it has somewhere useful to go", () => {
  // `ActivityRow` renders a `Button` when the row carries an anchor and static text
  // when it does not, so an anchor is a promise that the panel it opens says
  // something more about this row. Four kinds keep none on purpose: a settled
  // command is already fully told by its own sentence, a connection notice is about
  // the session rather than any surface, and a world event's list lives in the
  // drawer behind the *diplomacy* anchor — a control that scrolls to a treaty panel
  // is worse than plain text.
  assert.deepEqual(kinds.filter(kind => !activityAnchors[kind]).sort(),
    ["command-accepted", "command-rejected", "connection", "world-event"]);
  for (const kind of kinds.filter(kind => activityAnchors[kind])) {
    assert.ok(["city", "army", "logistics", "diplomacy", "hud"].includes(activityAnchors[kind]!),
      `${kind} points at a panel that has no anchor to scroll to`);
  }
});

test("the ring is newest-first, deduped by id, and the same array when nothing is new", () => {
  const first = deriveActivity([], { source: "command", commandId: "c1", label: "Xây kho", result: "accepted" }, NOW);
  assert.deepEqual(first.map(row => row.id), ["command-accepted:c1"]);
  assert.equal(first[0]!.at, NOW);
  const second = deriveActivity(first, { source: "command", commandId: "c2", label: "Tuyển quân", result: "accepted" }, NOW + 1000);
  assert.deepEqual(second.map(row => row.id), ["command-accepted:c2", "command-accepted:c1"]);
  // The same fact told twice — a redelivered socket message, a repeated snapshot —
  // must not grow the feed, and must hand back the *same array* so React can bail
  // out of the render instead of redrawing the column once a second forever.
  assert.equal(deriveActivity(second, { source: "command", commandId: "c2", label: "Tuyển quân", result: "accepted" }, NOW + 2000), second);
  // And the same for the arm that actually runs every tick: two snapshots that
  // differ in nothing a player needs told hand the ring straight back.
  assert.equal(deriveActivity(second, { source: "snapshot", previous: world(), next: world(), playerId: ME }, NOW + 3000), second);
});

test("the ring stops at its cap instead of growing with the session", () => {
  let ring: ActivityEvent[] = [];
  for (let index = 0; index < activityLimit + 20; index += 1) {
    ring = deriveActivity(ring, { source: "command", commandId: `c${index}`, label: "Xây kho", result: "accepted" }, NOW + index);
  }
  assert.equal(ring.length, activityLimit);
  assert.equal(ring[0]!.id, `command-accepted:c${activityLimit + 19}`, "the newest row must survive");
  assert.equal(ring.at(-1)!.id, "command-accepted:c20", "the oldest rows are the ones dropped");
});

test("a settled command is one row per command, whatever the server called the outcome", () => {
  const accepted = deriveActivity([], { source: "command", commandId: "c1", label: "Xây kho", result: "accepted" }, NOW);
  assert.equal(accepted[0]!.message, "Xây kho — máy chủ đã nhận.");
  assert.equal(accepted[0]!.state, "success");
  // `already_processed` is the server confirming a retry it had already applied:
  // the same outcome for the player, so the id is the same and the retry is silent.
  assert.equal(deriveActivity(accepted, { source: "command", commandId: "c1", label: "Xây kho", result: "already_processed" }, NOW + 1), accepted);
  const rejected = deriveActivity([], { source: "command", commandId: "c2", label: "Xây kho", result: "rejected", detail: "Không đủ tài nguyên." }, NOW);
  assert.equal(rejected[0]!.message, "Xây kho: Không đủ tài nguyên.");
  assert.equal(rejected[0]!.state, "rejected");
  // A rejection with no code still names the order it was: "Lệnh bị từ chối." alone
  // leaves the player to guess which of four build buttons it came from.
  assert.equal(deriveActivity([], { source: "command", commandId: "c3", label: "Xây kho", result: "rejected" }, NOW)[0]!.message, "Xây kho bị từ chối.");
});

test("a command that never came back gets one row, not one per failed attempt", () => {
  const first = deriveActivity([], { source: "command-uncertain", commandId: "c1", label: "Xây kho" }, NOW);
  assert.equal(first[0]!.kind, "command-uncertain");
  assert.equal(first[0]!.state, "uncertain");
  assert.equal(first[0]!.anchor, "hud", "the retry button lives in the pending strip");
  // Pressing Thử lại and failing again is the same open question, not a second one.
  assert.equal(deriveActivity(first, { source: "command-uncertain", commandId: "c1", label: "Xây kho" }, NOW + 9000), first);
});

test("a socket notice keeps the id its caller chose, so a redelivery is not a second row", () => {
  const message = "Lệnh tấn công bị hủy: mục tiêu đã bị tiêu diệt.";
  const canceled = deriveActivity([], { source: "notice", id: "order-canceled:a1:a2", kind: "order-canceled", message }, NOW);
  assert.equal(canceled[0]!.kind, "order-canceled");
  assert.equal(canceled[0]!.icon, activityIcons["order-canceled"]);
  assert.equal(canceled[0]!.anchor, "army");
  assert.equal(deriveActivity(canceled, { source: "notice", id: "order-canceled:a1:a2", kind: "order-canceled", message }, NOW + 5), canceled);
  // A reconnect overrides the kind's default chip: the same kind carries the loss,
  // and a restore is the one piece of good news the session state produces.
  const restored = deriveActivity([], { source: "notice", id: "connection:1", kind: "connection", message: "Đã kết nối lại phiên chơi.", state: "success", icon: "check" }, NOW);
  assert.equal(restored[0]!.state, "success");
  assert.equal(restored[0]!.icon, "check");
  assert.equal(restored[0]!.anchor, undefined, "a session notice has no panel to open");
});

test("a battle is won or lost from our own side of the report, not from victor alone", () => {
  const fight = report();
  const mine = deriveActivity([], { source: "report", report: fight, playerId: ME }, NOW)[0]!;
  const theirs = deriveActivity([], { source: "report", report: fight, playerId: FOE }, NOW)[0]!;
  assert.equal(mine.id, theirs.id, "one report is one fact, whoever is reading it");
  assert.equal(mine.state, "success");
  assert.equal(theirs.state, "hostile");
  assert.match(mine.message, /^Thắng trận ở ô 7,8 — /);
  assert.match(theirs.message, /^Thua trận ở ô 7,8 — /);
  // The strength left is ours, not the winner's: a loss still has to say what we
  // have left, which is the number that decides whether to retreat or reinforce.
  assert.ok(mine.message.endsWith(`${gameRules.recruitment.infantry.name} còn 60 sức.`), mine.message);
  assert.ok(theirs.message.endsWith(`${gameRules.recruitment.infantry.name} còn 0 sức.`), theirs.message);
  const drawn = deriveActivity([], { source: "report", report: report({ victor: "draw" }), playerId: ME }, NOW)[0]!;
  assert.equal(drawn.state, "warning");
  assert.match(drawn.message, /^Hòa trận/);
  assert.equal(drawn.anchor, "army");
});

test("the first snapshot of a session and the first of a new season are not news", () => {
  const building = world({ cities: [city({ queues: [queue()] }), foeCity()] });
  const built = world({ cities: [city({ buildings: { town_hall: 1, warehouse: 2 } }), foeCity()] });
  // A login would otherwise open with a wall of rows describing the world as it
  // stands, which is not a list of things that just happened.
  assert.deepEqual(diff(undefined, built), []);
  // A season reset drops every queue, caravan and treaty at once; none of that is
  // news about the new season.
  assert.deepEqual(diff(building, { ...built, season: { ...built.season, id: "season-2" } }), []);
  assert.equal(diff(building, built).length, 1, "the two guards must not also silence a real difference");
});

test("a finished build is a queue that vanished with its level reached", () => {
  const building = world({ cities: [city({ queues: [queue()] }), foeCity()] });
  const built = world({ cities: [city({ buildings: { town_hall: 1, warehouse: 2 } }), foeCity()] });
  const rows = diff(building, built);
  assert.deepEqual(rows.map(row => row.kind), ["build-finished"]);
  assert.equal(rows[0]!.id, "build:queue-1");
  assert.equal(rows[0]!.message, `Xây xong ${gameRules.buildings.warehouse.name} cấp 2 ở Hoa Lư.`);
  assert.equal(rows[0]!.anchor, "city");
  assert.deepEqual(diff(building, building), [], "a queue still running is not a build finished");
  // The server bumps the level and drops the entry in the same tick, so a queue
  // that vanished *without* the level reaching it says nothing rather than
  // announcing a building the city does not have.
  assert.deepEqual(diff(building, world({ cities: [city(), foeCity()] })), []);
  // Someone else's construction is visible in the snapshot and still not our news.
  const theirs = world({ cities: [city(), foeCity({ queues: [queue({ id: "queue-foe" })] })] });
  assert.deepEqual(diff(theirs, world({ cities: [city(), foeCity({ buildings: { town_hall: 1, warehouse: 2 } })] })), []);
});

test("a caravan is reported when it settles, once, and only if it is ours", () => {
  const moving = caravan();
  const before = world({ caravans: [moving] });
  const delivered = caravan({ status: "delivered", progress: 1 });
  const rows = diff(before, world({ caravans: [delivered] }));
  assert.deepEqual(rows.map(row => row.kind), ["caravan-delivered"]);
  assert.equal(rows[0]!.id, "caravan-delivered:caravan-1");
  assert.equal(rows[0]!.message, `Chuyến hàng tới Cổ Loa đã đến · ${CARGO}.`);
  assert.equal(rows[0]!.anchor, "logistics");
  // Delivered and ambushed caravans stay in the snapshot for the rest of the
  // session, so the *transition* is the fact: every tick afterwards is silent.
  assert.deepEqual(diff(world({ caravans: [delivered] }), world({ caravans: [delivered] })), []);
  const ambushed = diff(before, world({ caravans: [caravan({ status: "ambushed" })] }))[0]!;
  assert.equal(ambushed.kind, "caravan-ambushed");
  assert.equal(ambushed.state, "hostile");
  assert.equal(ambushed.message, `Chuyến hàng tới Cổ Loa bị chặn · ${CARGO}.`);
  // A market run has no destination city to name, and an empty hold no cargo to
  // list — the sentence has to survive both without printing a null or a "0 Gỗ".
  const toMarket = caravan({ destinationKind: "market", destinationCityId: null, cargo: undefined, status: "delivered" });
  assert.equal(diff(world({ caravans: [caravan({ destinationKind: "market", destinationCityId: null, cargo: undefined })] }),
    world({ caravans: [toMarket] }))[0]!.message, "Chuyến hàng tới chợ trung tâm đã đến.");
  const foreign = caravan({ id: "caravan-foe", ownerPlayerId: FOE });
  assert.deepEqual(diff(world({ caravans: [foreign] }), world({ caravans: [{ ...foreign, status: "delivered" }] })), []);
});

test("only our own espionage is reported, and only when it settles", () => {
  const running = mission();
  const before = world({ spyMissions: [running] });
  const rows = diff(before, world({ spyMissions: [mission({ status: "success" })] }));
  assert.deepEqual(rows.map(row => row.kind), ["spy-success"]);
  assert.equal(rows[0]!.id, "spy-success:spy-1");
  assert.equal(rows[0]!.message, `Điệp vụ ${spyMissionLabels.scout} vào Rival thành công.`);
  assert.equal(rows[0]!.anchor, "diplomacy");
  // A mission aimed at *us* is in the snapshot too, and reporting it would tell the
  // player they are being watched — something the game deliberately does not.
  const incoming = mission({ id: "spy-2", actorPlayerId: FOE, targetPlayerId: ME });
  assert.deepEqual(diff(world({ spyMissions: [incoming] }), world({ spyMissions: [{ ...incoming, status: "success" }] })), []);
  const failed = mission({ status: "failed" });
  assert.equal(diff(before, world({ spyMissions: [failed] }))[0]!.kind, "spy-failed");
  assert.deepEqual(diff(world({ spyMissions: [failed] }), world({ spyMissions: [failed] })), [], "a settled mission lingers; its row does not repeat");
  const stopped = diff(before, world({ spyMissions: [mission({ status: "intercepted" })] }))[0]!;
  assert.equal(stopped.kind, "spy-intercepted");
  assert.equal(stopped.state, "hostile");
});

test("treaties speak only about the pair we are in, and our own proposal is not news", () => {
  const incoming = treaty({ proposerPlayerId: FOE, targetPlayerId: ME });
  const proposed = diff(world(), world({ treaties: [incoming] }));
  assert.deepEqual(proposed.map(row => row.kind), ["treaty-proposed"]);
  assert.equal(proposed[0]!.message, `Rival đề nghị hiệp ước ${treatyLabels.non_aggression}.`);
  assert.equal(proposed[0]!.anchor, "diplomacy");
  // What we just sent is not something we were told; the pending strip already
  // shows the command, and the drawer shows the offer.
  assert.deepEqual(diff(world(), world({ treaties: [treaty()] })), []);
  const active = diff(world({ treaties: [incoming] }), world({ treaties: [{ ...incoming, status: "active" }] }))[0]!;
  assert.equal(active.kind, "treaty-active");
  assert.equal(active.state, "success");
  assert.equal(active.message, `Hiệp ước ${treatyLabels.non_aggression} với Rival đã có hiệu lực.`);
  // `rejected` and `expired` share one chip — both simply end the treaty — but keep
  // their own sentence and their own id, so one cannot swallow the other.
  const rejected = diff(world({ treaties: [treaty()] }), world({ treaties: [treaty({ status: "rejected" })] }))[0]!;
  const expired = diff(world({ treaties: [treaty({ status: "active" })] }), world({ treaties: [treaty({ status: "expired" })] }))[0]!;
  assert.equal(rejected.kind, "treaty-ended");
  assert.equal(expired.kind, "treaty-ended");
  assert.notEqual(rejected.id, expired.id);
  assert.match(rejected.message, /bị từ chối\.$/);
  assert.match(expired.message, /đã hết hạn\.$/);
  const violated = diff(world({ treaties: [treaty({ status: "active" })] }), world({ treaties: [treaty({ status: "violated" })] }))[0]!;
  assert.equal(violated.kind, "treaty-violated");
  assert.equal(violated.state, "hostile");
  // Two other players signing something changes nothing we can act on.
  const elsewhere = treaty({ id: "treaty-2", proposerPlayerId: FOE, targetPlayerId: "player-third" });
  assert.deepEqual(diff(world(), world({ treaties: [elsewhere] })), []);
  assert.deepEqual(diff(world({ treaties: [elsewhere] }), world({ treaties: [{ ...elsewhere, status: "active" }] })), []);
});

test("a world event is reported once, in the same words and colours the drawer uses", () => {
  const rows = diff(world(), world({ worldEvents: [worldEvent()] }));
  assert.deepEqual(rows.map(row => row.kind), ["world-event"]);
  assert.equal(rows[0]!.message, `${worldEventLabels.plague} · mức 2 · 2 ô bị ảnh hưởng.`);
  assert.equal(rows[0]!.state, worldEventStates.plague);
  assert.equal(rows[0]!.icon, worldEventIcons.plague);
  assert.deepEqual(diff(world({ worldEvents: [worldEvent()] }), world({ worldEvents: [worldEvent()] })), []);
  // A boon and a blight are the same kind of row wearing different chips, and both
  // read them from the registry `EventsPanel` reads rather than from a second
  // opinion here — that is what stops one event being named two ways.
  const rush = diff(world(), world({ worldEvents: [worldEvent({ id: "event-2", eventType: "gold_rush" })] }))[0]!;
  assert.equal(rush.state, worldEventStates.gold_rush);
  assert.notEqual(rush.state, rows[0]!.state);
});

test("a fight is told once, by the report and not also by the army diff", () => {
  const before = world({ armies: [army()] });
  assert.deepEqual(diff(before, world({ armies: [army({ strength: 40, morale: 30, supply: 60 })] })), [],
    "the battle report already says who won and with what left");
  // Nor does an army that disappeared: it was destroyed in the fight the report
  // describes, and a second row would be the same event told less precisely.
  assert.deepEqual(diff(before, world({ armies: [] })), []);
});

test("one snapshot can carry several facts, each with its own id and the same instant", () => {
  const before = world({ cities: [city({ queues: [queue()] }), foeCity()], caravans: [caravan()], treaties: [treaty({ status: "active" })] });
  const after = world({
    cities: [city({ buildings: { town_hall: 1, warehouse: 2 } }), foeCity()],
    caravans: [caravan({ status: "delivered", progress: 1 })],
    treaties: [treaty({ status: "violated" })],
    worldEvents: [worldEvent()],
  });
  const rows = deriveActivity([], { source: "snapshot", previous: before, next: after, playerId: ME }, NOW);
  assert.deepEqual(rows.map(row => row.kind), ["build-finished", "caravan-delivered", "treaty-violated", "world-event"]);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, "two facts share an id");
  for (const row of rows) assert.equal(row.at, NOW, "one snapshot is one instant");
});

// ── "Cần chú ý" ─────────────────────────────────────────────────────────────
//
// The second panel is not a shorter feed, and these tests are mostly about what it
// refuses to list. Anything that is merely history, or that is waiting on somebody
// else, would turn a panel a player is meant to empty into one they learn to ignore.

const uncertainCommand: PendingCommand = {
  commandId: "c1", kind: "build", label: "Xây kho", path: "/api/commands/build/queue",
  body: { buildingId: "warehouse" }, status: "uncertain", startedAt: NOW,
};
const sendingCommand: PendingCommand = { ...uncertainCommand, commandId: "c2", status: "sending" };

test("Cần chú ý counts the commands whose fate we do not know, and ignores the ones in flight", () => {
  const items = attentionItems(world(), [uncertainCommand, sendingCommand], ME);
  assert.deepEqual(items.map(item => item.id), ["attention:uncertain"]);
  assert.equal(items[0]!.message, "1 lệnh chưa xác nhận — hãy thử lại.");
  assert.equal(items[0]!.state, "uncertain");
  assert.equal(items[0]!.anchor, "hud");
  // A command still in flight is not waiting on the player: the control that issued
  // it carries its own chip, and this panel is only for things they must act on.
  assert.deepEqual(attentionItems(world(), [sendingCommand], ME), []);
  // A reload restores every persisted command as uncertain, before any snapshot has
  // arrived — the one case where this panel has to work without a world.
  assert.equal(attentionItems(undefined, [uncertainCommand], ME).length, 1);
  assert.deepEqual(attentionItems(undefined, [], ME), []);
});

test("Cần chú ý asks for the answers a server clock will otherwise take away", () => {
  const incoming = treaty({ proposerPlayerId: FOE, targetPlayerId: ME });
  const items = attentionItems(world({ treaties: [incoming] }), [], ME);
  assert.deepEqual(items.map(item => item.id), ["attention:treaty:treaty-1"]);
  assert.equal(items[0]!.message, `Rival đang chờ trả lời hiệp ước ${treatyLabels.non_aggression}.`);
  assert.equal(items[0]!.anchor, "diplomacy");
  // Our own offer is waiting on them, and a treaty already answered is not a question.
  assert.deepEqual(attentionItems(world({ treaties: [treaty()] }), [], ME), []);
  assert.deepEqual(attentionItems(world({ treaties: [{ ...incoming, status: "active" }] }), [], ME), []);
  const open = world({ alliances: [alliance], allianceVotes: [vote()] });
  assert.deepEqual(attentionItems(open, [], ME).map(item => item.id), ["attention:vote:vote-1"]);
  assert.equal(attentionItems(open, [], ME)[0]!.message, "Cuộc bầu Rival làm lãnh đạo đang mở — bạn chưa bỏ phiếu.");
  // Cast, closed, or held by an alliance we are not in: none of the three need us.
  assert.deepEqual(attentionItems(world({ alliances: [alliance], allianceVotes: [vote({ votes: [{ playerId: ME, vote: true, castAt: AT }] })] }), [], ME), []);
  assert.deepEqual(attentionItems(world({ alliances: [alliance], allianceVotes: [vote({ status: "passed" })] }), [], ME), []);
  assert.deepEqual(attentionItems(world({ allianceVotes: [vote()] }), [], ME), []);
});

test("Cần chú ý warns about an army the moment the server starts taking strength", () => {
  const threshold = gameRules.supply.attritionBelowSupply;
  const items = attentionItems(world({ armies: [army({ supply: threshold - 1 })] }), [], ME);
  assert.deepEqual(items.map(item => item.id), ["attention:supply:army-me"]);
  assert.equal(items[0]!.message, `${gameRules.recruitment.infantry.name} ở ô 6,7 chỉ còn ${threshold - 1}% tiếp tế.`);
  assert.equal(items[0]!.anchor, "army");
  // Exactly at the threshold nothing is bleeding yet — the same boundary the server
  // uses, read from the same constant rather than copied as a number.
  assert.deepEqual(attentionItems(world({ armies: [army({ supply: threshold })] }), [], ME), []);
  // A destroyed army cannot be fed, and someone else's is not ours to feed.
  assert.deepEqual(attentionItems(world({ armies: [army({ supply: 1, strength: 0 })] }), [], ME), []);
  assert.deepEqual(attentionItems(world({ armies: [army({ ownerPlayerId: FOE, supply: 1 })] }), [], ME), []);
  // NPC raiders carry no owner at all, which must not read as ours.
  assert.deepEqual(attentionItems(world({ armies: [army({ ownerType: "npc", ownerPlayerId: null, supply: 1 })] }), [], ME), []);
});

test("Cần chú ý puts the most answerable thing first and stops before it becomes a feed", () => {
  const crowded = world({
    treaties: [treaty({ proposerPlayerId: FOE, targetPlayerId: ME })],
    alliances: [alliance], allianceVotes: [vote()],
    armies: Array.from({ length: 6 }, (_, index) => army({ id: `army-${index}`, supply: 1 })),
  });
  const items = attentionItems(crowded, [uncertainCommand], ME);
  // Ours to resolve, then the two answers on a clock, then the armies — the order a
  // player reads the panel in, so it is the order the rules run in.
  assert.deepEqual(items.slice(0, 3).map(item => item.id.split(":")[1]), ["uncertain", "treaty", "vote"]);
  assert.equal(items.length, attentionLimit, "the panel has to end somewhere or nobody reads it");
  assert.ok(items.every(item => item.message.length > 0));
});

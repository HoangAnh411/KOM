// What has happened to *this* player, derived from what the client already has.
//
// `ActivityColumn.tsx` shipped with a four-row `aria-hidden` skeleton and a
// comment promising that "PR4 replaces the whole `<ActivityFeed />` slot below
// with client-derived events". This module is that replacement, and the comment's
// own reasoning is its hardest constraint: *"inventing rows that look like real
// events would be worse than an empty state."* So every row restates a fact the
// client was already told — a settled command, a battle report, a socket notice,
// or a difference between two consecutive snapshots. No new route, no new server
// event, no timer, no polling.
//
// Pure and React-free, because the client's test runner is a bare `node --test`
// with no DOM: `activity.test.ts` calls these functions directly and asserts the
// parts that are actually easy to get wrong — ordering, the ring's cap, the
// dedupe of a repeated snapshot, and one row per fact per kind of change.

import { gameRules } from "@kingdoms/shared";
import type { BattleReport, WorldSnapshot } from "@kingdoms/shared";
import type { PendingCommand } from "./commands.js";
import type { PanelAnchorId } from "./panel-anchors.js";
import type { IconName, UiState } from "./ui/tokens.js";
import { formatResources, spyMissionLabels, treatyLabels, worldEventIcons, worldEventLabels, worldEventStates } from "./vocabulary.js";

/** One row of the feed. `kind` decides the wording of the chip, `state` its
 *  colour, `anchor` where clicking the row jumps to. */
export type ActivityKind =
  | "command-accepted" | "command-rejected" | "command-uncertain"
  | "battle" | "build-finished" | "caravan-delivered" | "caravan-ambushed"
  | "spy-success" | "spy-failed" | "spy-intercepted"
  | "treaty-proposed" | "treaty-active" | "treaty-ended" | "treaty-violated"
  | "world-event" | "order-canceled" | "connection";

export type ActivityEvent = {
  /** Derived from the fact, never from a counter: the same snapshot pair yields
   *  the same ids, which is what makes the dedupe below able to run on every
   *  snapshot without growing the feed. */
  id: string;
  at: number;
  kind: ActivityKind;
  state: UiState;
  icon: IconName;
  message: string;
  anchor?: PanelAnchorId;
};

/** The chip's wording — one per kind, so a row's category is readable without
 *  parsing its sentence. `activity.test.ts` fails when a kind is added without
 *  one, which is the only thing stopping a new row from shipping blank. */
export const activityKindLabels: Record<ActivityKind, string> = {
  "command-accepted": "Đã xác nhận",
  "command-rejected": "Bị từ chối",
  "command-uncertain": "Chưa xác nhận",
  battle: "Trận đánh",
  "build-finished": "Xây xong",
  "caravan-delivered": "Hàng đã đến",
  "caravan-ambushed": "Bị chặn hàng",
  "spy-success": "Điệp vụ xong",
  "spy-failed": "Điệp vụ hỏng",
  "spy-intercepted": "Bị phản gián",
  "treaty-proposed": "Đề nghị hiệp ước",
  "treaty-active": "Hiệp ước hiệu lực",
  "treaty-ended": "Hiệp ước kết thúc",
  "treaty-violated": "Hiệp ước bị phá",
  "world-event": "Sự kiện thế giới",
  "order-canceled": "Lệnh bị hủy",
  connection: "Kết nối",
};

/** The glyph and the chip a kind wears by default. Three kinds refine the state
 *  from their own data — a battle is won or lost, a world event is a boon or a
 *  blight (`worldEventStates`), a connection row announces a loss or a restore —
 *  and each of those refinements comes from a registry that already fixes one
 *  wording and one glyph per value, so no row invents a colour of its own. */
export const activityIcons: Record<ActivityKind, IconName> = {
  "command-accepted": "check",
  "command-rejected": "ban",
  "command-uncertain": "link-off",
  battle: "crosshair",
  "build-finished": "city",
  "caravan-delivered": "caravan",
  "caravan-ambushed": "caravan",
  "spy-success": "eye",
  "spy-failed": "eye",
  "spy-intercepted": "eye",
  "treaty-proposed": "treaty",
  "treaty-active": "treaty",
  "treaty-ended": "treaty",
  "treaty-violated": "treaty",
  "world-event": "alert",
  "order-canceled": "ban",
  connection: "link-off",
};

export const activityStates: Record<ActivityKind, UiState> = {
  "command-accepted": "success",
  "command-rejected": "rejected",
  "command-uncertain": "uncertain",
  battle: "hostile",
  "build-finished": "success",
  "caravan-delivered": "success",
  "caravan-ambushed": "hostile",
  "spy-success": "success",
  "spy-failed": "warning",
  "spy-intercepted": "hostile",
  "treaty-proposed": "warning",
  "treaty-active": "success",
  "treaty-ended": "warning",
  "treaty-violated": "hostile",
  "world-event": "warning",
  "order-canceled": "warning",
  connection: "warning",
};

/** Where a row's anchor points. `undefined` means the fact has no panel to open
 *  (a connection notice is about the session, not about a surface). */
export const activityAnchors: Partial<Record<ActivityKind, PanelAnchorId>> = {
  "command-uncertain": "hud",
  battle: "army",
  "build-finished": "city",
  "caravan-delivered": "logistics",
  "caravan-ambushed": "logistics",
  "spy-success": "diplomacy",
  "spy-failed": "diplomacy",
  "spy-intercepted": "diplomacy",
  "treaty-proposed": "diplomacy",
  "treaty-active": "diplomacy",
  "treaty-ended": "diplomacy",
  "treaty-violated": "diplomacy",
  "order-canceled": "army",
};

/** The feed is a ring, not a log: 50 rows is more than the column can show in a
 *  session and small enough that a six-hour game cannot grow it without bound. */
export const activityLimit = 50;

/** The four things the client learns, in the shape it learns them. There is no
 *  fifth arm on purpose: a row that cannot be traced to one of these is a row
 *  somebody invented. */
export type ActivityInput =
  /** A command came back from the server (`settle`). */
  | { source: "command"; commandId: string; label: string; result: "accepted" | "already_processed" | "rejected"; detail?: string }
  /** A command's send failed or timed out and was downgraded to uncertain. */
  | { source: "command-uncertain"; commandId: string; label: string }
  /** A battle report arrived over the socket, already filtered to our fights. */
  | { source: "report"; report: BattleReport; playerId: string }
  /** A one-shot socket notice: an attack order the server cancelled, or the
   *  session reconnecting. Not recomputed from state, so the caller owns the id. */
  | { source: "notice"; id: string; kind: "order-canceled" | "connection"; message: string; state?: UiState; icon?: IconName }
  /** Two consecutive snapshots. The diff is where the world's own events come
   *  from; `previous` is `undefined` for the first snapshot of a session. */
  | { source: "snapshot"; previous: WorldSnapshot | undefined; next: WorldSnapshot; playerId: string };

type Draft = Omit<ActivityEvent, "at" | "state" | "icon" | "anchor"> & Partial<Pick<ActivityEvent, "state" | "icon" | "anchor">>;

function complete(draft: Draft, at: number): ActivityEvent {
  return {
    at,
    state: draft.state ?? activityStates[draft.kind],
    icon: draft.icon ?? activityIcons[draft.kind],
    anchor: draft.anchor ?? activityAnchors[draft.kind],
    id: draft.id,
    kind: draft.kind,
    message: draft.message,
  };
}

/** Prepends the new rows, newest first, dropping any id the ring already holds.
 *
 *  Returns `previous` **by identity** when nothing is new — snapshots arrive
 *  every second or two and most of them change nothing a player needs told, so
 *  the common case has to be a no-op React can bail out of rather than a fresh
 *  array that re-renders the column. */
function merge(previous: ActivityEvent[], rows: ActivityEvent[]): ActivityEvent[] {
  if (rows.length === 0) return previous;
  const seen = new Set(previous.map(event => event.id));
  const fresh: ActivityEvent[] = [];
  for (const row of rows) if (!seen.has(row.id)) { seen.add(row.id); fresh.push(row); }
  if (fresh.length === 0) return previous;
  return [...fresh, ...previous].slice(0, activityLimit);
}

const nameOf = (snapshot: WorldSnapshot, playerId: string): string =>
  snapshot.cities.find(city => city.playerId === playerId)?.playerName ?? "người chơi khác";

/** `queue.buildingId` is a free string in the protocol, so the lookup can miss.
 *  It falls back to a Vietnamese noun rather than the raw key: a player should
 *  never read `road_depot`, even in a case that cannot happen today. */
const buildingName = (buildingId: string): string =>
  (gameRules.buildings as Record<string, { name: string } | undefined>)[buildingId]?.name ?? "công trình";

const unitName = (unitType: keyof typeof gameRules.recruitment): string => gameRules.recruitment[unitType].name;

/** The single entry point. Give it the ring and one thing that happened; it
 *  gives back the ring. */
export function deriveActivity(previous: ActivityEvent[], input: ActivityInput, now: number): ActivityEvent[] {
  return merge(previous, drafts(input).map(draft => complete(draft, now)));
}

function drafts(input: ActivityInput): Draft[] {
  switch (input.source) {
    case "command": {
      // `already_processed` is the server confirming a retry it had already
      // applied — the same outcome for the player as `accepted`, and the reason
      // the id carries the outcome rather than the raw result.
      if (input.result === "rejected") return [{
        id: `command-rejected:${input.commandId}`,
        kind: "command-rejected",
        message: input.detail ? `${input.label}: ${input.detail}` : `${input.label} bị từ chối.`,
      }];
      return [{ id: `command-accepted:${input.commandId}`, kind: "command-accepted", message: `${input.label} — máy chủ đã nhận.` }];
    }
    case "command-uncertain":
      // One row per command, not per failed attempt: a second failure of the
      // same id is the same open question, and the pending strip is where its
      // live state and its Thử lại button live.
      return [{ id: `command-uncertain:${input.commandId}`, kind: "command-uncertain", message: `${input.label} chưa xác nhận — hãy thử lại.` }];
    case "report":
      return [reportDraft(input.report, input.playerId)];
    case "notice":
      return [{ id: input.id, kind: input.kind, message: input.message, state: input.state, icon: input.icon }];
    case "snapshot":
      return snapshotDrafts(input.previous, input.next, input.playerId);
  }
}

/** Won, lost or drew — read from our own side of the report rather than from
 *  `victor` alone, because the same `victor: "attacker"` is a win for one player
 *  and a loss for the other. */
function reportDraft(report: BattleReport, playerId: string): Draft {
  const weAttacked = report.attacker.playerId === playerId;
  const mine = weAttacked ? report.attacker : report.defender;
  const outcome = report.victor === "draw" ? "draw" : (report.victor === "attacker") === weAttacked ? "win" : "loss";
  const word = outcome === "win" ? "Thắng trận" : outcome === "loss" ? "Thua trận" : "Hòa trận";
  return {
    id: `battle:${report.id}`,
    kind: "battle",
    state: outcome === "win" ? "success" : outcome === "loss" ? "hostile" : "warning",
    message: `${word} ở ô ${report.tileX},${report.tileY} — ${unitName(mine.unitType)} còn ${mine.strengthAfter} sức.`,
  };
}

/** The world's own events, read as the difference between two snapshots.
 *
 *  Two guards decide when *not* to speak, and both matter more than the rows
 *  themselves. Without `previous` there is no difference to report — the first
 *  snapshot of a session is the world as it stands, not a list of things that
 *  just happened, and treating it as one would greet every login with a wall of
 *  rows. A change of `season.id` is the same problem at a larger scale: every
 *  queue, caravan and treaty of the old season disappears at once, and none of
 *  that is news about the new one. */
function snapshotDrafts(previous: WorldSnapshot | undefined, next: WorldSnapshot, playerId: string): Draft[] {
  if (!previous || previous.season.id !== next.season.id) return [];
  const rows: Draft[] = [];

  // Builds: the server bumps the level and drops the queue entry in the same
  // tick, so a queue id that vanished while its target level was reached is a
  // completed build. A queue that vanished *without* the level reaching it (a
  // path the server has no code for today) says nothing rather than guessing.
  for (const before of previous.cities.filter(city => city.playerId === playerId)) {
    const after = next.cities.find(city => city.id === before.id);
    if (!after) continue;
    for (const queue of before.queues) {
      if (after.queues.some(item => item.id === queue.id)) continue;
      if ((after.buildings[queue.buildingId] ?? 0) < queue.targetLevel) continue;
      rows.push({
        id: `build:${queue.id}`,
        kind: "build-finished",
        message: `Xây xong ${buildingName(queue.buildingId)} cấp ${queue.targetLevel} ở ${after.name}.`,
      });
    }
  }

  // Caravans: only the moving → settled transition, so a delivered caravan that
  // lingers in the snapshot is reported once and not once per tick afterwards.
  const wasMoving = new Set((previous.caravans ?? []).filter(caravan => caravan.status === "moving").map(caravan => caravan.id));
  for (const caravan of next.caravans ?? []) {
    if (caravan.ownerPlayerId !== playerId || !wasMoving.has(caravan.id) || caravan.status === "moving") continue;
    const destination = caravan.destinationKind === "market"
      ? "chợ trung tâm"
      : next.cities.find(city => city.id === caravan.destinationCityId)?.name ?? "thành phố";
    const cargo = formatResources(caravan.cargo ?? {}, "");
    const arrival = caravan.status === "delivered" ? `Chuyến hàng tới ${destination} đã đến` : `Chuyến hàng tới ${destination} bị chặn`;
    rows.push({
      id: `caravan-${caravan.status}:${caravan.id}`,
      kind: caravan.status === "delivered" ? "caravan-delivered" : "caravan-ambushed",
      message: cargo ? `${arrival} · ${cargo}.` : `${arrival}.`,
    });
  }

  // Espionage: our own missions only. The snapshot may carry missions aimed at
  // us, and turning those into rows would tell a player something the game
  // deliberately does not — that they are being watched.
  const missionWas = new Map((previous.spyMissions ?? []).map(mission => [mission.id, mission.status]));
  for (const mission of next.spyMissions ?? []) {
    if (mission.actorPlayerId !== playerId || mission.status === "in_progress") continue;
    if (missionWas.get(mission.id) !== "in_progress") continue;
    const target = nameOf(next, mission.targetPlayerId);
    const verdict = mission.status === "success" ? "thành công" : mission.status === "failed" ? "thất bại" : "bị phản gián chặn";
    rows.push({
      id: `spy-${mission.status}:${mission.id}`,
      kind: mission.status === "success" ? "spy-success" : mission.status === "failed" ? "spy-failed" : "spy-intercepted",
      message: `Điệp vụ ${spyMissionLabels[mission.missionType]} vào ${target} ${verdict}.`,
    });
  }

  // Treaties we are a party to: a new proposal aimed at us, and every status the
  // pair moves to afterwards. `rejected` and `expired` share one kind — both end
  // the treaty and neither needs its own chip — but keep their own sentence.
  const treatyWas = new Map((previous.treaties ?? []).map(treaty => [treaty.id, treaty.status]));
  for (const treaty of next.treaties ?? []) {
    const partnerId = treaty.proposerPlayerId === playerId ? treaty.targetPlayerId : treaty.proposerPlayerId;
    if (treaty.proposerPlayerId !== playerId && treaty.targetPlayerId !== playerId) continue;
    const before = treatyWas.get(treaty.id);
    if (before === treaty.status) continue;
    const label = treatyLabels[treaty.treatyType];
    const partner = nameOf(next, partnerId);
    if (treaty.status === "proposed") {
      if (treaty.targetPlayerId !== playerId) continue; // our own outgoing proposal is not news to us
      rows.push({ id: `treaty-proposed:${treaty.id}`, kind: "treaty-proposed", message: `${partner} đề nghị hiệp ước ${label}.` });
    } else if (treaty.status === "active") {
      rows.push({ id: `treaty-active:${treaty.id}`, kind: "treaty-active", message: `Hiệp ước ${label} với ${partner} đã có hiệu lực.` });
    } else if (treaty.status === "violated") {
      rows.push({ id: `treaty-violated:${treaty.id}`, kind: "treaty-violated", message: `Hiệp ước ${label} với ${partner} đã bị phá.` });
    } else {
      const ending = treaty.status === "rejected" ? "bị từ chối" : "đã hết hạn";
      rows.push({ id: `treaty-${treaty.status}:${treaty.id}`, kind: "treaty-ended", message: `Hiệp ước ${label} với ${partner} ${ending}.` });
    }
  }

  // World events are kingdom-wide, so they are the one source not filtered by
  // owner. State and glyph come from the same registries the drawer reads, which
  // is what stops the feed and `EventsPanel` describing one event two ways.
  const known = new Set((previous.worldEvents ?? []).map(event => event.id));
  for (const event of next.worldEvents ?? []) {
    if (known.has(event.id)) continue;
    rows.push({
      id: `world-event:${event.id}`,
      kind: "world-event",
      state: worldEventStates[event.eventType],
      icon: worldEventIcons[event.eventType],
      message: `${worldEventLabels[event.eventType]} · mức ${event.severity} · ${event.affectedTiles.length} ô bị ảnh hưởng.`,
    });
  }

  // Armies deliberately produce no row: a fight we were in already arrives as a
  // battle report, which says who won and with what left, and a second row from
  // the strength diff would be the same fight told twice and less precisely.
  return rows;
}

// ── "Cần chú ý": what is still open, rather than what happened ───────────────
//
// The second panel of the column is not a shorter feed. The feed answers "what
// happened", which is history and never changes; this answers "what is waiting
// for me", which is read from the *current* snapshot every render and empties
// itself when the player deals with it. Four rules, every one of them a fact the
// snapshot already carries and a thing the player can actually act on.

export type AttentionItem = { id: string; state: UiState; icon: IconName; message: string; anchor?: PanelAnchorId };

/** More than this and the panel becomes a second feed nobody reads. */
export const attentionLimit = 6;

export function attentionItems(snapshot: WorldSnapshot | undefined, pending: PendingCommand[], playerId: string): AttentionItem[] {
  const items: AttentionItem[] = [];

  // 1. Commands whose fate we do not know. Ours to resolve, so they come first.
  const uncertain = pending.filter(item => item.status === "uncertain").length;
  if (uncertain > 0) items.push({
    id: "attention:uncertain",
    state: "uncertain",
    icon: "link-off",
    message: `${uncertain} lệnh chưa xác nhận — hãy thử lại.`,
    anchor: "hud",
  });
  if (!snapshot) return items;

  // 2. Treaties waiting on our answer, and 3. an open leader vote we have not
  //    cast. Both expire on a server clock, so a player who never opens the
  //    drawer loses the choice by default.
  for (const treaty of snapshot.treaties ?? []) {
    if (treaty.status !== "proposed" || treaty.targetPlayerId !== playerId) continue;
    items.push({
      id: `attention:treaty:${treaty.id}`,
      state: "warning",
      icon: "treaty",
      message: `${nameOf(snapshot, treaty.proposerPlayerId)} đang chờ trả lời hiệp ước ${treatyLabels[treaty.treatyType]}.`,
      anchor: "diplomacy",
    });
  }
  const myAlliance = (snapshot.alliances ?? []).find(alliance => alliance.members.some(member => member.playerId === playerId));
  for (const vote of snapshot.allianceVotes ?? []) {
    if (!myAlliance || vote.allianceId !== myAlliance.id || vote.status !== "open") continue;
    if (vote.votes.some(cast => cast.playerId === playerId)) continue;
    items.push({
      id: `attention:vote:${vote.id}`,
      state: "warning",
      icon: "banner",
      message: `Cuộc bầu ${nameOf(snapshot, vote.candidatePlayerId)} làm lãnh đạo đang mở — bạn chưa bỏ phiếu.`,
      anchor: "diplomacy",
    });
  }

  // 4. Armies below the attrition threshold. `attritionBelowSupply` is the
  //    server's own number, the same one `ArmyPanel` colours the row with, so the
  //    warning appears exactly when the army starts bleeding strength.
  for (const army of snapshot.armies) {
    if (army.ownerPlayerId !== playerId || army.strength <= 0) continue;
    if (army.supply >= gameRules.supply.attritionBelowSupply) continue;
    items.push({
      id: `attention:supply:${army.id}`,
      state: "warning",
      icon: "alert",
      message: `${unitName(army.unitType)} ở ô ${army.x},${army.y} chỉ còn ${army.supply}% tiếp tế.`,
      anchor: "army",
    });
  }
  return items.slice(0, attentionLimit);
}

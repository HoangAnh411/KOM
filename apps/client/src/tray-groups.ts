// The command tray's right half: which of the commands the client already has
// apply to whatever the player just clicked on the map.
//
// The slot shipped empty on purpose — a label, a comment promising commands, and
// a `display: none` below 1024px, so on the band where the kingdom column is a
// flyout over the map the tray said nothing at all. Filling it adds no gameplay:
// every command below already exists as a button in the kingdom column or as a
// route the client already calls. What the tray adds is that the player does not
// have to know which panel owns the thing they are looking at.
//
// Pure, like `activity.ts` and for the same reason: the client's test runner is
// bare `node --test` with no DOM, so the selection → commands table is asserted
// directly (`tray-groups.test.ts`) and `CommandTray.tsx` only renders it.
//
// The one law worth stating: an unavailable command is *disabled with a reason*,
// never hidden. A hidden button reads as a feature the game does not have; a
// greyed one with a sentence beside it reads as a state the player can change.
// That is why every command carries a `Check` and no builder filters its list.

import type { Army, City, ResourceNode, WorldSnapshot } from "@kingdoms/shared";
import type { ClientCommand } from "./commands.js";
import type { MapSelection } from "./map.js";
import type { PanelAnchorId } from "./panel-anchors.js";
import type { InteractionMode, PanelId } from "./state.js";
import type { ButtonVariant, IconName } from "./ui/tokens.js";
import {
  armyNotFrozen, enemyInSight, firstReason, mergeCandidates, mergeReady, notFrozen, orderToCancel, type Check,
} from "./validation.js";
import { armyLabel, formationLabels, resourceLabels } from "./vocabulary.js";

/** What pressing a tray command does. The table knows nothing about the server
 *  or the shell — it hands one of these to the component, which owns the hooks.
 *  Keeping the decision pure is what makes it testable without a DOM. */
export type TrayIntent =
  | { kind: "order"; mode: "move" | "attack"; armyId: string }
  | { kind: "cancel-order" }
  | { kind: "command"; command: ClientCommand }
  | { kind: "merge"; armyId: string; candidates: Army[] }
  /** `PanelAnchorId` minus `"hud"`: a tray command jumps to a panel the nav can
   *  also mark, so the component can pass the anchor straight to
   *  `setActivePanel` without narrowing it first. */
  | { kind: "panel"; anchor: Extract<PanelAnchorId, PanelId> };

export type TrayCommand = {
  /** Unique inside its group: the React key, and the `data-command` attribute
   *  the e2e spec presses. */
  id: string;
  label: string;
  variant: ButtonVariant;
  intent: TrayIntent;
  /** Never absent. A command with nothing to say carries `{ ok: true }`, and a
   *  blocked one always carries the sentence — so "disabled" and "why" cannot
   *  come apart, the same contract `validation.ts` states for the panels. */
  check: Check;
};

export type TrayGroup = {
  id: string;
  /** What the group is, not what is selected. The left half of the tray already
   *  names the selection, and saying it twice inside a 60px strip spends the only
   *  space the commands have. */
  title: string;
  icon: IconName;
  /** The sentence for a group with nothing to press — which is the whole content
   *  of an information-only selection, and never an empty tray. */
  hint?: string;
  commands: TrayCommand[];
};

/** The identity of what is selected: the left half of the tray, derived here so
 *  the two halves cannot disagree about what the player clicked. */
export type TraySubject = { title: string; detail: string };

/** The tray is one 60px row and has to stay that height whether it holds commands
 *  or not: it shares a grid with the map, and the map's box is what Pixi sizes its
 *  canvas from. Four compact buttons plus a one-line reason is what fits beside
 *  the selection's name at 1024px, so a fifth command is a failing test rather
 *  than a second row. */
export const trayCommandLimit = 4;

/** `firstReason` in `Check` shape: one sentence per control, chosen by the order
 *  the builder listed its conditions. */
const gate = (...checks: Check[]): Check => {
  const reason = firstReason(...checks);
  return reason === undefined ? { ok: true } : { ok: false, reason };
};

const armyIn = (snapshot: WorldSnapshot, id: string): Army | undefined => snapshot.armies.find(army => army.id === id);
const cityIn = (snapshot: WorldSnapshot, id: string): City | undefined => snapshot.cities.find(city => city.id === id);
const nodeAt = (snapshot: WorldSnapshot, x: number, y: number): ResourceNode | undefined =>
  snapshot.logistics.resourceNodes.find(node => node.x === x && node.y === y);

const panelCommand = (anchor: Extract<PanelAnchorId, PanelId>, label: string): TrayCommand =>
  ({ id: `panel-${anchor}`, label, variant: "ghost", intent: { kind: "panel", anchor }, check: { ok: true } });

/** The groups for the current selection. Always exactly one — the tray shows the
 *  commands for one subject, and a strip that stacks two groups is a strip that
 *  grew a second row — but a list, because "no group" must be representable as
 *  the empty case rather than as `undefined`. */
export function trayGroups(
  selection: MapSelection | undefined,
  interaction: InteractionMode,
  snapshot: WorldSnapshot | undefined,
  playerId: string,
): TrayGroup[] {
  // An order in progress outranks the selection: the player is mid-gesture, the
  // next click belongs to the map, and the only useful button is "stop".
  if (interaction.kind !== "idle") return [orderingGroup(interaction.kind)];
  if (!snapshot || !selection) return [nothingGroup()];
  // Tile first, and not for style: `MapSelection` puts `"army" | "city"` in one
  // member, so only the tile branch narrows the union — testing for the others
  // first leaves `x` and `y` unreachable.
  if (selection.kind === "tile") return [tileGroup(snapshot, selection.x, selection.y)];
  if (selection.kind === "army") return [armyGroup(snapshot, selection.id, playerId)];
  return [cityGroup(snapshot, selection.id, playerId)];
}

const orderingGroup = (mode: "move" | "attack"): TrayGroup => ({
  id: `ordering-${mode}`,
  title: mode === "move" ? "Đang chọn điểm đến" : "Đang chọn mục tiêu",
  icon: "crosshair",
  hint: mode === "move" ? "Nhấp vào bản đồ để chọn điểm đến." : "Nhấp vào quân địch để ra lệnh tấn công.",
  commands: [{ id: "stop-order", label: "Hủy", variant: "ghost", intent: { kind: "cancel-order" }, check: { ok: true } }],
});

const nothingGroup = (): TrayGroup => ({
  id: "nothing",
  title: "Chưa chọn gì",
  icon: "crosshair",
  hint: "Nhấp vào quân đội, thành phố hoặc ô đất trên bản đồ để thấy lệnh cho nó.",
  commands: [],
});

/** The same payload `ArmyPanel` sends, down to the `kind` and the label. Two
 *  spellings of one command would light the panel's pending chip for one of them
 *  and leave it dark for the other. */
const cancelArmyOrder = (armyId: string): ClientCommand =>
  ({ kind: "cancel_army_order", label: "Hủy lệnh", path: "/api/commands/cancel-army-order", body: { armyId } });

function armyGroup(snapshot: WorldSnapshot, armyId: string, playerId: string): TrayGroup {
  const army = armyIn(snapshot, armyId);
  // A snapshot can retire the selection under the player: an army that lost its
  // last battle is gone from `armies`, and one that reached 0 strength is still
  // listed for a tick. Neither can be ordered.
  if (!army || army.strength <= 0) {
    return { id: "army-gone", title: "Quân đã tan", icon: "sword", hint: "Quân này không còn trên bản đồ.", commands: [] };
  }
  if (army.ownerPlayerId !== playerId) {
    return {
      id: `army-foreign-${army.id}`,
      title: army.npcKind ? "Quân trung lập" : "Quân của người khác",
      icon: "sword",
      // Information only — and the hint is where the command went. Attacking is
      // something *your* army does, so the tray names the selection that would
      // carry the order instead of offering a button that never could.
      hint: "Chọn một quân đội của bạn, bấm Tấn công rồi nhấp vào quân này.",
      commands: [],
    };
  }
  const live = armyNotFrozen(army);
  const candidates = mergeCandidates(snapshot.armies, army, playerId);
  return {
    id: `army-${army.id}`,
    title: "Lệnh quân đội",
    icon: "sword",
    commands: [
      { id: "move", label: "Di chuyển", variant: "secondary", intent: { kind: "order", mode: "move", armyId: army.id }, check: gate(live) },
      { id: "attack", label: "Tấn công", variant: "destructive", intent: { kind: "order", mode: "attack", armyId: army.id }, check: gate(live, enemyInSight(snapshot.armies, playerId)) },
      { id: "merge", label: "Hợp nhất", variant: "secondary", intent: { kind: "merge", armyId: army.id, candidates }, check: gate(live, mergeReady(snapshot.armies, army, playerId)) },
      { id: "cancel-order", label: "Hủy lệnh", variant: "ghost", intent: { kind: "command", command: cancelArmyOrder(army.id) }, check: gate(live, orderToCancel(army)) },
    ],
  };
}

function cityGroup(snapshot: WorldSnapshot, cityId: string, playerId: string): TrayGroup {
  const city = cityIn(snapshot, cityId);
  if (!city) {
    return { id: "city-gone", title: "Thành phố không còn", icon: "city", hint: "Thành phố này không còn trong ảnh chụp mới nhất.", commands: [] };
  }
  if (city.playerId !== playerId) {
    return {
      id: `city-foreign-${city.id}`,
      title: "Thành phố của người khác",
      icon: "city",
      hint: `Của ${city.playerName}. Chọn một quân đội của bạn, bấm Di chuyển rồi nhấp vào đây để tiến quân.`,
      commands: [],
    };
  }
  // Every command a city has — build, recruit, harvest, caravan, route — is a form
  // with a cost and a choice in it, and a 60px strip is the wrong place to fill in
  // a form. So the own-city group is the shortest path to the panels that own
  // them, which is the thing the player was actually missing: in a compact band
  // that column is closed, and nothing on the map said where the controls went.
  return {
    id: `city-${city.id}`,
    title: "Thành phố của bạn",
    icon: "city",
    hint: firstReason(notFrozen(city)) ?? "Lệnh của thành phố nằm trong cột vương quốc.",
    commands: [
      panelCommand("city", "Mở bảng Thành phố"),
      panelCommand("army", "Mở bảng Quân đội"),
      panelCommand("logistics", "Mở bảng Vận tải"),
    ],
  };
}

function tileGroup(snapshot: WorldSnapshot, x: number, y: number): TrayGroup {
  const node = nodeAt(snapshot, x, y);
  if (node) {
    return {
      id: `node-${node.id}`,
      title: "Điểm khai thác",
      icon: "caravan",
      hint: `Mỏ ${resourceLabels[node.resourceType]} — còn ${node.remaining}/${node.capacity}. Lệnh khai thác nằm ở bảng Vận tải.`,
      commands: [panelCommand("logistics", "Mở bảng Vận tải")],
    };
  }
  return {
    id: `tile-${x}-${y}`,
    title: "Ô đất",
    icon: "crosshair",
    hint: "Chưa có gì ở ô này. Chọn một quân đội của bạn, bấm Di chuyển rồi nhấp vào đây.",
    commands: [],
  };
}

/** An army carries only its owner's id, so the name has to come from that
 *  player's city — the one place a snapshot spells it out. */
const ownerLabel = (snapshot: WorldSnapshot, army: Army, playerId: string): string => {
  if (!army.ownerPlayerId) return "Không thuộc người chơi nào";
  if (army.ownerPlayerId === playerId) return "Của bạn";
  return snapshot.cities.find(city => city.playerId === army.ownerPlayerId)?.playerName ?? "Người chơi khác";
};

/** The left half of the tray. Strength is in the title and not repeated in the
 *  detail: the old inspector printed it twice, once as a number and once behind a
 *  `⚔` whose meaning was in a tooltip. */
export function traySubject(selection: MapSelection | undefined, snapshot: WorldSnapshot | undefined, playerId: string): TraySubject {
  if (!snapshot || !selection) return { title: "Chưa chọn gì", detail: "Nhấp vào quân đội, thành phố hoặc ô đất trên bản đồ." };
  if (selection.kind === "tile") {
    const node = nodeAt(snapshot, selection.x, selection.y);
    if (node) return { title: `Mỏ ${resourceLabels[node.resourceType]}`, detail: `Còn ${node.remaining}/${node.capacity} · Vị trí (${node.x},${node.y})` };
    return { title: `Ô đất (${selection.x},${selection.y})`, detail: "Chưa có gì ở ô này." };
  }
  if (selection.kind === "army") {
    const army = armyIn(snapshot, selection.id);
    if (!army) return { title: "Quân đã tan", detail: "Quân này không còn trong ảnh chụp mới nhất." };
    return {
      title: `${armyLabel(army)} · ${army.strength}`,
      detail: `${ownerLabel(snapshot, army, playerId)} · Đội hình ${formationLabels[army.formation]} · Nhuệ khí ${army.morale} · Tiếp tế ${army.supply}% · Vị trí (${army.x},${army.y})`,
    };
  }
  const city = cityIn(snapshot, selection.id);
  if (!city) return { title: "Thành phố không còn", detail: "Thành phố này không còn trong ảnh chụp mới nhất." };
  return { title: city.name, detail: `${city.playerId === playerId ? "Của bạn" : city.playerName} · Vị trí (${city.x},${city.y})` };
}

/** Which panel a map selection is about, so clicking your own army on the map
 *  moves the kingdom column to the panel that commands it and the nav's existing
 *  `aria-current` marks it.
 *
 *  `undefined` means "nothing of yours": a foe's city has no panel of the
 *  player's to mark, and dragging the column somewhere else would take them off
 *  whatever they were doing to look at it. */
export function panelForSelection(
  selection: MapSelection | undefined,
  snapshot: WorldSnapshot | undefined,
  playerId: string,
): Extract<PanelAnchorId, PanelId> | undefined {
  if (!snapshot || !selection) return undefined;
  if (selection.kind === "tile") return nodeAt(snapshot, selection.x, selection.y) ? "logistics" : undefined;
  if (selection.kind === "army") {
    const army = armyIn(snapshot, selection.id);
    return army && army.ownerPlayerId === playerId && army.strength > 0 ? "army" : undefined;
  }
  const city = cityIn(snapshot, selection.id);
  return city && city.playerId === playerId ? "city" : undefined;
}

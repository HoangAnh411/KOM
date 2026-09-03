// The player-facing vocabulary for the things a snapshot names in English.
//
// The server speaks `food`/`wood`/`stone`/`iron`; the UI is Vietnamese. Before
// this module, three panels each invented their own translation and the header
// invented none at all: `CityPanel` wrote `{cost.wood}g {cost.stone}đ`,
// `LogisticsPanel` wrote `hàng {cargo.wood}g/{cargo.stone}đ`, and
// `StrategicHeader` printed the raw key `wood`. Same four numbers, four
// spellings, one of them not even Vietnamese.
//
// So exactly one module is allowed to name a resource, and it is this one. No
// React and no DOM, because the client's bare `node --test` runner asserts it
// directly (`vocabulary.test.ts`) — see also `errors.ts`, which owns the same
// job for server error codes.

import type { AllianceRole, Resources, TreatyType, WorldEventType } from "@kingdoms/shared";
import type { IconName, UiState } from "./ui/tokens.js";

export type ResourceKey = keyof Resources;

/** Typed as `Record<ResourceKey, string>` on purpose: adding a resource to
 *  `resourceSchema` in `@kingdoms/shared` becomes a compile error here instead
 *  of an untranslated key on a player's screen. */
export const resourceLabels: Record<ResourceKey, string> = {
  food: "Lương thực",
  wood: "Gỗ",
  stone: "Đá",
  iron: "Sắt",
};

/** Display order, exhaustive by construction. Matches the field order of
 *  `resourceSchema`, so the header reads the same way the API is shaped. */
export const resourceKeys = Object.keys(resourceLabels) as ResourceKey[];

/** A cost or a cargo: always a subset of the four, and usually with zeros in it. */
export type ResourceBundle = Partial<Record<ResourceKey, number>>;

/** One spelling for a bundle, zeros dropped. "150 Gỗ · 80 Đá" says what a thing
 *  costs; "150g 80đ 0s" said nothing and said it three different ways. */
export function formatResources(bundle: ResourceBundle, empty: string): string {
  const parts = resourceKeys
    .filter(key => (bundle[key] ?? 0) > 0)
    .map(key => `${bundle[key]} ${resourceLabels[key]}`);
  return parts.length > 0 ? parts.join(" · ") : empty;
}

/** Thin named wrappers so the empty wording is decided once per meaning rather
 *  than at each of the dozen call sites. A free building and an empty caravan
 *  are not the same fact. */
export const formatCost = (cost: ResourceBundle): string => formatResources(cost, "Miễn phí");
export const formatCargo = (cargo: ResourceBundle): string => formatResources(cargo, "Không có hàng");

// ── The snapshot's other English: three enums a player used to read raw ──────
//
// `EventsPanel` printed `mob_migration` and `DiplomacyPanel` printed
// `non_aggression`, twice each; the alliance member list printed `(officer)`.
// They live beside the resources because the failure is the same one — a key on
// screen instead of a word — and because the activity feed and the drawer have
// to say the same thing about the same event.

/** Typed against the shared enums, so a world event or treaty type added to the
 *  protocol is a compile error here rather than a key on a player's screen. */
export const worldEventLabels: Record<WorldEventType, string> = {
  drought: "Hạn hán",
  plague: "Dịch bệnh",
  earthquake: "Động đất",
  mob_migration: "Loạn quân di cư",
  gold_rush: "Cơn sốt vàng",
};

/** Three of the five share `alert`: they are the same kind of fact — a temporary
 *  malus on production — and the wording plus the chip's colour is what separates
 *  them. `stateIcons` already reuses a glyph for the same reason. */
export const worldEventIcons: Record<WorldEventType, IconName> = {
  drought: "alert",
  plague: "alert",
  earthquake: "alert",
  mob_migration: "sword",
  gold_rush: "check",
};

/** Which of the eight chips an event wears. The sheet used to carry a third
 *  colour scheme for this — `--kom-event-boon` / `--kom-event-blight` on a left
 *  rule — which meant an event's severity was told in colours nothing else in the
 *  UI used. */
export const worldEventStates: Record<WorldEventType, UiState> = {
  drought: "warning",
  plague: "warning",
  earthquake: "warning",
  mob_migration: "hostile",
  gold_rush: "success",
};

/** The type of a treaty, without the word "hiệp ước" — every call site already
 *  supplies it ("đề nghị hiệp ước Phòng thủ", "Hiệp ước Phòng thủ với X"), and a
 *  label carrying it too reads as "hiệp ước hiệp ước". `trade_pact` has a label
 *  even though the propose form does not offer one: a peer's client may, and the
 *  row that shows it is ours. */
export const treatyLabels: Record<TreatyType, string> = {
  non_aggression: "Không xâm lược",
  trade_pact: "Thương mại",
  defensive_pact: "Phòng thủ",
};

export const allianceRoleLabels: Record<AllianceRole, string> = {
  leader: "Lãnh đạo",
  officer: "Chỉ huy",
  member: "Thành viên",
};

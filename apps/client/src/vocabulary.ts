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

import type { Resources } from "@kingdoms/shared";

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

// The Situation Room's responsive contract.
//
// Free of React and the DOM on purpose: the client's test runner is a bare
// `node --test` with no window, so the only way to assert the layout rules is to
// keep them as pure functions and check them against `styles.css` read as text
// (the same pairing `ui-primitives.test.ts` uses for the design system).
//
// The split of responsibility is deliberate and worth stating once:
//
//   * CSS media queries own the *geometry* of a band — which surfaces are grid
//     tracks and which are flyouts over the map. Geometry stays in CSS so it is
//     correct on the first paint and during a resize drag, with no JS in the way.
//   * This module owns the *open/closed* state, because a collapsible surface
//     has to report `aria-expanded` and that lives in React.
//
// Both read the same two breakpoints, and `layout.test.ts` fails if the numbers
// here and the media queries in `styles.css` ever drift apart.

/** Lower bound of each band, in CSS pixels. Mirrored by `@media (min-width: …)`
 *  blocks in `styles.css`; `bandQueries` is the shared spelling. */
export const layoutBreakpoints = { medium: 1024, wide: 1440 } as const;

export const layoutBands = ["compact", "medium", "wide"] as const;
export type LayoutBand = (typeof layoutBands)[number];

/** The two secondary surfaces flanking the map. The map itself is never a
 *  surface in this sense: it is always mounted and never collapses. */
export const surfaceIds = ["kingdom", "activity"] as const;
export type SurfaceId = (typeof surfaceIds)[number];
export type SurfaceState = Readonly<Record<SurfaceId, boolean>>;

/** Element ids the header's toggles point `aria-controls` at. Kept here so the
 *  button and the region it controls cannot disagree. */
export const surfaceElementIds: Record<SurfaceId, string> = {
  kingdom: "kingdom-column",
  activity: "activity-column",
};

/** The media queries the shell listens to, in the exact spelling `styles.css`
 *  uses. Mobile-first (`min-width` only) so there is no half-pixel band between
 *  two queries where neither rule applies. */
export const bandQueries: readonly string[] = [layoutBreakpoints.medium, layoutBreakpoints.wide]
  .map((px) => `(min-width: ${px}px)`);

export function bandFor(width: number): LayoutBand {
  if (width >= layoutBreakpoints.wide) return "wide";
  if (width >= layoutBreakpoints.medium) return "medium";
  return "compact";
}

/** The same decision as `bandFor`, taken from how many of `bandQueries` currently
 *  match instead of from a pixel width. That is what the shell actually uses:
 *  `window.innerWidth` counts the classic scrollbar and a `min-width` query does
 *  not, so deriving the band from a width can disagree with the stylesheet by
 *  ~15px right at a breakpoint — and a disagreement there means React thinks a
 *  column is a flyout while CSS is drawing it as a track.
 *
 *  Mobile-first queries are cumulative, so the count *is* the band index: none
 *  match below 1024, one at 1024, both at 1440. `layout.test.ts` pins the two
 *  arrays to that relationship. */
export function bandForMatches(matched: number): LayoutBand {
  return layoutBands[Math.min(Math.max(matched, 0), layoutBands.length - 1)]!;
}

/** What a band shows before the player touches anything.
 *
 *  The kingdom column is strategic context and stays open wherever it fits as a
 *  track. The activity column is the surface that yields first: below 1440px the
 *  map would drop under ~800px of usable width with three tracks open, and the
 *  map staying dominant is the point of the layout. */
export function defaultSurfaces(band: LayoutBand): SurfaceState {
  return { kingdom: band !== "compact", activity: band === "wide" };
}

/** Below the medium breakpoint both surfaces are flyouts over the map, so two
 *  open at once would leave no map underneath. Opening one closes the other. */
export function toggleSurface(current: SurfaceState, id: SurfaceId, band: LayoutBand): SurfaceState {
  const next = !current[id];
  if (band === "compact" && next) return { kingdom: id === "kingdom", activity: id === "activity" };
  return id === "kingdom" ? { ...current, kingdom: next } : { ...current, activity: next };
}

/** Reveal a surface, which is not the same request as toggling it. A row in the
 *  activity feed that points at the city panel has to make sure the kingdom
 *  column is open; `toggleSurface` would have closed it in every band where it
 *  already was. Returns `current` unchanged — by identity, so React can bail out
 *  of the render — when there is nothing to open. */
export function openSurface(current: SurfaceState, id: SurfaceId, band: LayoutBand): SurfaceState {
  if (current[id]) return current;
  if (band === "compact") return { kingdom: id === "kingdom", activity: id === "activity" };
  return id === "kingdom" ? { ...current, kingdom: true } : { ...current, activity: true };
}

/** Only the closed state gets a class: an open surface is the base rule, and a
 *  closed one has to collapse its grid track to zero. Every class this can emit
 *  is asserted to have a rule in `styles.css`. */
export function shellClass(surfaces: SurfaceState): string {
  return ["situation-room", ...surfaceIds.filter((id) => !surfaces[id]).map((id) => `situation-room--${id}-closed`)]
    .join(" ");
}

import { useEffect, useRef } from "react";
import type { SurfaceId } from "./layout.js";
import { useGame } from "./state.js";

/** Panels the nav rail and the onboarding checklist can jump to.
 *
 * Both used to find their target with a CSS class selector
 * (`document.querySelector(".city-panel")`), which ties behaviour to styling and
 * breaks silently whenever the styles are reworked. Panels register their own
 * element here instead, so the jump goes through a real reference. */
export type PanelAnchorId = "city" | "army" | "logistics" | "diplomacy" | "hud";

const anchors = new Map<PanelAnchorId, HTMLElement>();

export function usePanelAnchor<T extends HTMLElement>(id: PanelAnchorId) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    anchors.set(id, element);
    return () => { if (anchors.get(id) === element) anchors.delete(id); };
  });
  return ref;
}

export function revealPanel(id: PanelAnchorId): void {
  anchors.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Jumping to a panel *from outside the kingdom column* — the activity feed and
 *  the command tray. Scrolling is only the last of four steps, and the feed had
 *  worked all four out inline; the tray needs the same four, so they live here
 *  once rather than in two components that could drift apart.
 *
 *  The column may be closed (in a compact band it is a flyout over the map, and
 *  the caller's own surface is the one covering it — `openSurface` swaps them),
 *  the nav has to end up marking where the player now is, diplomacy lives behind
 *  a `<details>` that has to be opened, and only then is there an element to
 *  scroll to. The 60ms is that last point: in compact the anchor is inside a
 *  surface this very click has just opened. */
export function usePanelJump(reveal: (id: SurfaceId) => void): (anchor: PanelAnchorId) => void {
  const { setActivePanel, setAdvancedOpen } = useGame();
  return (anchor: PanelAnchorId) => {
    reveal("kingdom");
    // `"hud"` is the column itself rather than one of the panels the nav lists,
    // so there is nothing for `activePanel` to mark.
    if (anchor !== "hud") setActivePanel(anchor);
    if (anchor === "diplomacy") setAdvancedOpen(true);
    setTimeout(() => revealPanel(anchor), 60);
  };
}

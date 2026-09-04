import { useEffect, useRef } from "react";

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

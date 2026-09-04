// Inline 24x24 stroke paths, one entry per icon. Kept as data in a plain module
// so the set is testable without a DOM and so nothing pulls in an icon package
// for eight glyphs.
//
// Stroke-only and colourless by construction: every icon inherits `currentColor`
// from its container, which is what lets one glyph serve all eight semantic
// states without an eight-fold duplication of the same shape.

import type { IconName } from "./tokens.js";

export const iconViewBox = "0 0 24 24";

export const iconPaths: Record<IconName, string> = {
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7.5v5l3.5 2",
  alert: "M12 4 3 20h18L12 4M12 10v4M12 16.8h.01",
  ban: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M6.2 6.2l11.6 11.6",
  lock: "M6 11h12v9.5H6zM9 11V8.2a3 3 0 0 1 6 0V11",
  "link-off": "M10 14l-2.4 2.4a3.6 3.6 0 0 1-5-5L5 9M14 10l2.4-2.4a3.6 3.6 0 0 1 5 5L19 15M4.5 4.5l15 15",
  check: "M5 12.8l4.2 4.2L19 7.2",
  crosshair: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21",
  eye: "M2.5 12S6 6.2 12 6.2 21.5 12 21.5 12 18 17.8 12 17.8 2.5 12 2.5 12M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6",
};

// Inline 24x24 stroke paths, one entry per icon. Kept as data in a plain module
// so the set is testable without a DOM and so nothing pulls in an icon package
// for a dozen glyphs.
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
  // The five HUD subjects. Drawn as silhouettes rather than scenes: at the
  // 14px the nav chips render them at, an outlined keep with windows in it is a
  // grey smudge, and the shape has to survive being that small.
  city: "M4 21V10l4-2.5V5l4-2 4 2v2.5l4 2.5v11M10 21v-5h4v5M3 21h18",
  sword: "M12 3v12M8 15h8M12 15v4M10 19h4",
  caravan: "M3 8h11v7H3zM14 11h3l3 3v1h-6M7 16a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6M16.5 16a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6",
  treaty: "M6 4h9l3 3v13H6zM15 4v3h3M9 12h6M9 16h4",
  // A banner on a pole, for the alliance. The swallowtail is what tells it apart
  // from `treaty` at 14px, where both are otherwise a pale rectangle.
  banner: "M6 3v18M6 4h12l-3 4 3 4H6",
  food: "M12 21V9M12 13c-3.8 0-6.5-2.1-7.5-5.5C8.2 7.1 10.9 8.6 12 11M12 11c1.1-2.4 3.8-3.9 7.5-3.5C18.5 10.9 15.8 13 12 13",
  wood: "M5 7h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2M7 7v10M17 7v10M9 10h6M9 14h6",
  stone: "M5 8l4-4h6l4 4-2 10H7L5 8M5 8h14M9 4l2 4-1 10M15 4l-2 4 1 10",
  iron: "M4 18 19 5M14 4l6 1-1 6M6 16l4 4M5 13l6 6",
  // The visualisation set. Same rules as above: one stroke path, silhouette
  // first, readable at 14px. Geometry adapted from Lucide (ISC) where a known
  // shape already reads well at this size.
  crown: "M4 18h16M4 18 3 8l5 4 4-7 4 7 5-4-1 10",
  shield: "M12 3l8 3v6c0 4.5-3.4 7.4-8 9-4.6-1.6-8-4.5-8-9V6zM12 8v6M9 11h6",
  scroll: "M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6M6 4a2 2 0 0 0-2 2v1h4M6 20a2 2 0 0 1-2-2v-1h4M8 4v16M12 9h4M12 13h4",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7.5v9M9.5 9.5h3.7a1.8 1.8 0 0 1 0 3.6H9.5M9.5 13.1h4.5",
  gem: "M7 4h10l4 5-9 11L3 9zM3 9h18M7 4l5 5 5-5M12 9v11",
  chest: "M4 10h16v9H4zM4 10a8 8 0 0 1 16 0M10 14h4",
  star: "M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1-5.4-2.9-5.4 2.9 1.1-6.1L3.2 9.4l6.1-.8z",
  hourglass: "M7 3h10M7 21h10M8 3v3.5L12 11l4-4.5V3M8 21v-3.5L12 13l4 4.5V21",
  hammer: "M4 20l7-7M11 13l6-6 3 3-2 2-1-1-6 6zM14 7l3-3 3 3-3 3",
  pickaxe: "M4 20 15 9M13 4c3.5.5 6.5 3.5 7 7M13 4l-1.5 1.5M20 11l-1.5 1.5M11 6c1.5 0 4 1 5.5 2.5S19 13 19 13",
  wheat: "M12 21V8M12 8C10 8 8.5 6.5 8.5 4.5 10.5 4.5 12 6 12 8M12 8c2 0 3.5-1.5 3.5-3.5C13.5 4.5 12 6 12 8M12 13c-2 0-3.5-1.5-3.5-3.5 2 0 3.5 1.5 3.5 3.5M12 13c2 0 3.5-1.5 3.5-3.5C13.5 9.5 12 11 12 13M12 18c-2 0-3.5-1.5-3.5-3.5 2 0 3.5 1.5 3.5 3.5M12 18c2 0 3.5-1.5 3.5-3.5C13.5 14.5 12 16 12 18",
  "map-pin": "M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5",
  flag: "M6 21V4M6 4h12l-2.5 4L18 12H6",
  flame: "M12 3c1 3.5-2.5 5-2.5 8.5a4.5 4.5 0 0 0 9 0c0-1.5-.7-2.7-1.6-3.8.2 1.6-.4 2.8-1.4 3.3.4-3-.5-6-3.5-8M12 21a4.5 4.5 0 0 1-4.5-4.5c0-1.2.4-2.2 1-3.2",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 11.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2",
  plus: "M12 5v14M5 12h14",
  minus: "M4.5 12h15",
  horse: "M5 21v-4c0-4 2.5-7 7-7 1 0 2 .3 2.8.8L18 8l2 3-2.5 1.5c.4 1 .5 2 .5 3v5.5M9.5 21v-4M14.5 21v-4.5M18 8c-.5-2-2-3.5-4-3.5-1.5 0-2 .5-3 1.5",
};

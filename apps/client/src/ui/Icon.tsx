import { iconPaths, iconViewBox } from "./icon-paths.js";
import type { IconName } from "./tokens.js";
import { iconClass } from "./variants.js";

/** An inline SVG glyph that inherits its colour from the surrounding text.
 *
 *  Decorative by default: an icon sitting next to its own label is noise to a
 *  screen reader, so it is `aria-hidden` unless the caller supplies a `title`,
 *  which is the case where the icon is carrying meaning on its own. */
export function Icon({ name, size = "md", title, className }: {
  name: IconName;
  size?: "sm" | "md";
  title?: string;
  className?: string;
}) {
  return <svg
    className={iconClass(size, className)}
    viewBox={iconViewBox}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    role={title ? "img" : undefined}
    aria-hidden={title ? undefined : true}
    aria-label={title}
  ><path d={iconPaths[name]} /></svg>;
}

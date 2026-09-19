import { Icon } from "./Icon.js";
import type { IconName } from "./tokens.js";
import { METER_RADIUS, meterFor } from "./progress-meter.js";

/** A circular progress dial: a stroke ring with an icon in its hollow centre.
 *  The "fewer words" pass replaces `<small>key</small><strong>value</strong>`
 *  text grids with one glyph and one number; the wording moves into the
 *  accessible name so a screen reader still reads the whole sentence.
 *
 *  The value itself is rendered by the caller, next to the dial — the ring is
 *  36 viewBox units and a legible number will not fit inside it. */
export function ProgressMeter({ fraction, label, icon, size = "md" }: {
  fraction: number;
  /** The full sentence, e.g. "Kinh tế 640 trên 1000". The ring is a picture;
   *  this is what it says. */
  label: string;
  icon?: IconName;
  size?: "sm" | "md";
}) {
  const meter = meterFor(fraction);
  return <div
    className={`kom-meter kom-meter--${size}`}
    role="img"
    aria-label={label}
  >
    <svg className="kom-meter__ring" viewBox="0 0 36 36" aria-hidden="true">
      <circle className="kom-meter__track" cx="18" cy="18" r={METER_RADIUS} fill="none" />
      <circle
        className="kom-meter__fill"
        cx="18"
        cy="18"
        r={METER_RADIUS}
        fill="none"
        strokeDasharray={meter.strokeDasharray}
        strokeDashoffset={meter.strokeDashoffset}
      />
    </svg>
    {icon && <Icon name={icon} className="kom-meter__icon" size="sm" />}
  </div>;
}

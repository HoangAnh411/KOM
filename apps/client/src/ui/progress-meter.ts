// A progress ring's geometry, pure so the bare node runner can hold the math
// the component leans on: clamping, and the dash trick that turns a circle
// whose circumference is 100 into a percentage scale. The dash arithmetic is
// exactly the kind of thing that drifts when edited inline in JSX — a ring
// that silently overfills or starts at three o'clock is a regression the
// rendered pixel cannot be asked about on a headless runner.

export type ProgressMeterModel = {
  /** The clamped fill, 0–1. Returned because callers size captions and pick
   *  three-state styles from the same number the ring draws. */
  fraction: number;
  /** `<full> <rest>` in circumference-percent units, ready for
   *  `stroke-dasharray` without further arithmetic. */
  strokeDasharray: string;
  /** The quarter-turn that starts the arc at twelve o'clock. Constant, but a
   *  constant the SVG needs every render and the test pins to a quarter. */
  strokeDashoffset: number;
};

/** `r` for a viewBox of 36: `2πr = 100`, so one dash unit is one percent. */
export const METER_RADIUS = 15.9155;
export const METER_TOP_OFFSET = 25;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

export function meterFor(fraction: number): ProgressMeterModel {
  const value = clamp01(fraction);
  const percent = value * 100;
  return {
    fraction: value,
    strokeDasharray: `${percent} ${100 - percent}`,
    strokeDashoffset: METER_TOP_OFFSET,
  };
}

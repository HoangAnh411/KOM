// Queue progress as a fraction, pure so both countdown surfaces (the build
// rows in CityPanel, the research line in ProgressionPanel) draw the same
// ring from the same timestamps — and so the bare node runner can hold the
// edge cases: no start time, a clock past the deadline, a zero-length queue.

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/** Elapsed share of a queue item, 0–1. An item without `startedAt` (the
 *  field is optional on the city queue) has no known duration, so the ring
 *  stays empty and the seconds text beside it carries the meaning alone. */
export function queueProgress(startedAt: string | undefined, completesAt: string, now: number): number {
  const end = Date.parse(completesAt);
  const start = startedAt !== undefined ? Date.parse(startedAt) : Number.NaN;
  if (!Number.isFinite(end) || !Number.isFinite(start)) return 0;
  const total = end - start;
  if (total <= 0) return 1;
  return clamp01((now - start) / total);
}

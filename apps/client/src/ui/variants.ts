// Class-name builders. Pure functions rather than inline template strings in the
// components, because the client test runner has no DOM: this is the only layer
// where "does the primitive ask for a class that actually exists?" is testable.

import type { ButtonVariant, Density, PanelAccent, UiState } from "./tokens.js";

const join = (...parts: Array<string | false | undefined>): string => parts.filter(Boolean).join(" ");

export function panelClass(options: { density?: Density; accent?: PanelAccent; flush?: boolean; className?: string } = {}): string {
  return join(
    "kom-panel",
    options.density === "compact" && "kom-panel--compact",
    options.accent && `kom-panel--accent-${options.accent}`,
    options.flush && "kom-panel--flush",
    options.className,
  );
}

export function buttonClass(
  variant: ButtonVariant,
  options: { density?: Density; block?: boolean; className?: string } = {},
): string {
  return join(
    "kom-btn",
    `kom-btn--${variant}`,
    options.density === "compact" && "kom-btn--compact",
    options.block && "kom-btn--block",
    options.className,
  );
}

export function statusClass(state: UiState, options: { block?: boolean; className?: string } = {}): string {
  return join("kom-status", `kom-status--${state}`, options.block && "kom-status--block", options.className);
}

export function iconClass(size: "sm" | "md" = "md", className?: string): string {
  return join("kom-icon", size === "sm" && "kom-icon--sm", className);
}

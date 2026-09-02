import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Icon } from "./Icon.js";
import { stateIcons, stateLabels, type UiState } from "./tokens.js";
import { statusClass } from "./variants.js";

/** One chip for all eight states. The label defaults to `stateLabels[state]` so
 *  two surfaces cannot invent two different words for the same condition;
 *  `children` is there for the cases that need to add detail ("Đang gửi · 3s"),
 *  not to rename the state.
 *
 *  No `role` is set. A chip that renders once is static content, and marking it
 *  `role="status"` would turn every panel into a live region that re-announces
 *  itself on unrelated re-renders. The surfaces that genuinely announce — the
 *  pending strip, the toast, the frozen banner — own that decision and pass
 *  `role` / `aria-live` themselves.
 *
 *  `glyph="icon"` swaps the dot for the state's icon. Colour is the fast signal
 *  but it is the only signal a dot carries, so anywhere the chip has to survive
 *  being read without colour, the shape has to come along. */
export function StatusChip({ state, children, block, glyph = "dot", className, ...rest }: {
  state: UiState;
  children?: ReactNode;
  block?: boolean;
  glyph?: "dot" | "icon" | "none";
} & Omit<ComponentPropsWithoutRef<"span">, "children">) {
  return <span className={statusClass(state, { block, className })} {...rest}>
    {glyph === "dot" ? <span className="kom-status__dot" /> : null}
    {glyph === "icon" ? <Icon name={stateIcons[state]} size="sm" /> : null}
    {children ?? stateLabels[state]}
  </span>;
}

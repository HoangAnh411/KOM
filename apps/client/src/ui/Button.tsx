import { forwardRef, useId, type ComponentPropsWithoutRef } from "react";
import { playUiClickFromUserGesture } from "../audio.js";
import type { ButtonVariant, Density } from "./tokens.js";
import { buttonClass } from "./variants.js";

/** `type="button"` is the default on purpose: a bare `<button>` inside a form
 * submits it, and every button in this UI issues a command instead. Callers
 * that really do want a submit pass `type="submit"` explicitly.
 *
 * `reason` is the gate: when a disabled button has one, the reason renders as
 * visible text beside it. A disabled button is removed from the tab order, so
 * `aria-describedby` on its own would be announced to nobody. */
export const Button = forwardRef<HTMLButtonElement, {
  variant?: ButtonVariant;
  density?: Density;
  block?: boolean;
  reason?: string;
} & Omit<ComponentPropsWithoutRef<"button">, "type"> & { type?: "button" | "submit" | "reset" }>(function Button({
  variant = "secondary",
  density,
  block,
  reason,
  className,
  type = "button",
  onClick,
  ...rest
}, ref) {
  const reasonId = useId();
  const gated = Boolean(rest.disabled && reason);
  const button = <button
    ref={ref}
    type={type}
    className={buttonClass(variant, { density, block, className })}
    aria-describedby={gated ? reasonId : undefined}
    onClick={onClick ? event => {
      onClick(event);
      if (!event.defaultPrevented) playUiClickFromUserGesture();
    } : undefined}
    {...rest}
  />;
  if (!gated) return button;
  return <span className="kom-btn-gate">
    {button}
    <span className="kom-btn-reason" id={reasonId}>{reason}</span>
  </span>;
});

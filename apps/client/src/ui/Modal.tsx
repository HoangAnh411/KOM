import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button.js";

/** The one dialog in the client. `role="dialog"` is written here and nowhere else
 *  — `ui-primitives.test.ts` scans the source to keep that true — because a
 *  dialog is not markup, it is four behaviours that have to arrive together:
 *
 *  1. focus moves into the dialog on open,
 *  2. Tab cycles inside it and cannot leave,
 *  3. Escape cancels,
 *  4. focus returns to whatever opened it.
 *
 *  Three of the four modals shipped with only the markup. The treaty-break
 *  confirm had all four, so this is its mechanism extracted verbatim, with two
 *  changes: `summary` joins the focusable list (the battle report's "hiệp đấu"
 *  disclosure was unreachable by keyboard), and the effect no longer depends on
 *  `onClose`. Callers pass an inline arrow, so a dependency on it re-ran the whole
 *  effect on every snapshot push — restoring focus and then grabbing it back,
 *  which is felt as the slider or radio you were using losing focus every second.
 */
const focusableSelector = "button, [href], input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";

/** Gameplay listeners live outside the dialog tree, so they need an explicit
 * answer when deciding whether a key belongs to the modal or the game. */
export function isModalOpen(): boolean {
  return typeof document !== "undefined"
    && document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

export function Modal({ title, children, actions, onClose, className }: {
  title: ReactNode;
  children?: ReactNode;
  /** Rendered in the action band. Order is tab order: cancel first, then commit. */
  actions?: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const card = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    const focusable = (): HTMLElement[] => Array.from(card.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
      .filter(element => !element.matches(":disabled"));
    // The first control, not the confirming one and not the header ×: on a
    // destructive dialog that is "Hủy", so a stray Enter cancels instead of
    // committing. The × closes too, but it is a one-glyph target — focus
    // belongs to the labelled control (and `phase7c` asserts exactly that).
    (focusable().find(element => !element.classList.contains("modal-close")) ?? focusable()[0] ?? card.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        // Unmount after the native key event finishes; closing synchronously here
        // can re-focus the opener while Chromium is still dispatching Escape.
        window.setTimeout(() => closeRef.current(), 0);
        return;
      }
      if (event.key !== "Tab") return;
      event.stopPropagation();
      const list = focusable();
      if (list.length === 0) { event.preventDefault(); return; }
      const first = list[0]!; const last = list[list.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    card.current?.addEventListener("keydown", onKeyDown);
    return () => { card.current?.removeEventListener("keydown", onKeyDown); restoreTo?.focus?.(); };
  }, []);

  return <div className="modal-backdrop" onClick={() => closeRef.current()}>
    {/* `tabIndex={-1}` so a dialog with no controls still takes focus; the trap's
        selector excludes `-1`, so it stays out of the Tab cycle. */}
    <div ref={card} className={`modal-card${className ? ` ${className}` : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={event => event.stopPropagation()}>
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        {/* Escape and the backdrop already close, but neither is visible. A
            player who opens the hub from the dock sees the map go inert — the
            game is "frozen" unless a close control is right there on the card. */}
        <Button variant="ghost" density="compact" className="modal-close" aria-label="Đóng" onClick={() => closeRef.current()}>×</Button>
      </div>
      {children}
      {actions ? <div className="modal-actions">{actions}</div> : null}
    </div>
  </div>;
}

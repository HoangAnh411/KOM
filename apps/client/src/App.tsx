import { useEffect } from "react";
import { GameProvider, useGame } from "./state.js";
import { AuthScreen } from "./components/AuthScreen.js";
import { SituationRoom } from "./components/SituationRoom.js";
import { Button } from "./ui/Button.js";

// After the Situation Room redesign this file owns exactly three things: the
// provider, the choice between the auth screen and the game, and the toast layer
// that has to sit above both. Everything that used to live here — the top bar, the
// nav rail, the map lifecycle, the HUD, the action bar — moved into
// `components/` as the five shell surfaces, because a layout that can rearrange
// itself needs each surface to be a component that can be placed, not a branch of
// one render function.

function Root() {
  const { state, notices, dismissNotice } = useGame();
  // Escape clears the notices, and it is the only keyboard path that works within
  // the four seconds a toast lives: the dismiss button is real and focusable, but
  // reaching it means tabbing from wherever focus is, through every control on the
  // screen, to a button that is about to disappear. Bound only while something is
  // up, so an idle page carries no listener. `defaultPrevented` is the seam with
  // `ui/Modal.tsx`, which calls `preventDefault()` on its own Escape — cancelling a
  // dialog must not also wipe the notices behind it.
  useEffect(() => {
    if (notices.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      for (const notice of notices) dismissNotice(notice.id);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [notices, dismissNotice]);
  return <main>
    {state.session && state.snapshot ? <SituationRoom /> : <AuthScreen />}
    {/* The layer is always mounted, even with nothing in it: a live region has to
        exist before content is inserted into it, or the first notice of the session
        is announced to nobody. It is also what stacks two notices instead of
        printing the second one on top of the first — every toast used to be
        `position: fixed` at the same corner.

        The body of a toast must not eat clicks (a notice about a command must not
        block the control that issues the next one), so the layer keeps
        `pointer-events: none` and only the dismiss button takes it back. That
        button replaces an `onClick` on the toast `<div>` itself, which was dead
        code the moment the sheet said `pointer-events: none` — unreachable by mouse
        and never in the tab order to begin with. */}
    <div className="toast-layer" role="status" aria-live="polite">
      {notices.map(notice => <div key={notice.id} className={`toast toast-${notice.kind}`}>
        <span className="toast__text">{notice.message}</span>
        <Button
          variant="ghost"
          density="compact"
          className="toast__close"
          aria-label="Đóng thông báo"
          onClick={() => dismissNotice(notice.id)}
        >Đóng</Button>
      </div>)}
    </div>
  </main>;
}

export default function App() {
  return <GameProvider><Root /></GameProvider>;
}

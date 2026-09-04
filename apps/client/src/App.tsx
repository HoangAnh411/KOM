import { GameProvider, useGame } from "./state.js";
import { AuthScreen } from "./components/AuthScreen.js";
import { SituationRoom } from "./components/SituationRoom.js";

// After the Situation Room redesign this file owns exactly three things: the
// provider, the choice between the auth screen and the game, and the toast layer
// that has to sit above both. Everything that used to live here — the top bar, the
// nav rail, the map lifecycle, the HUD, the action bar — moved into
// `components/` as the five shell surfaces, because a layout that can rearrange
// itself needs each surface to be a component that can be placed, not a branch of
// one render function.

function Root() {
  const { state, notices, dismissNotice } = useGame();
  return <main>
    {state.session && state.snapshot ? <SituationRoom /> : <AuthScreen />}
    {notices.map(notice => <div key={notice.id} className={`toast toast-${notice.kind}`} role="status" onClick={() => dismissNotice(notice.id)}>{notice.message}</div>)}
  </main>;
}

export default function App() {
  return <GameProvider><Root /></GameProvider>;
}

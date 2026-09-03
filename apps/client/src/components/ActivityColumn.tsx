import { activityKindLabels, attentionItems, type ActivityEvent, type AttentionItem } from "../activity.js";
import { surfaceElementIds, type SurfaceId } from "../layout.js";
import { revealPanel, type PanelAnchorId } from "../panel-anchors.js";
import { useGame } from "../state.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { StatusChip } from "../ui/Status.js";

/** The right column: what just happened, and what is still waiting.
 *
 *  It shipped as an `aria-hidden` skeleton with a comment saying the rows would
 *  arrive when there was something real to put in them — "inventing rows that
 *  look like real events would be worse than an empty state". `activity.ts` is
 *  that something: both panels below are pure functions of state the client
 *  already holds, so this file has no fetch, no effect and no timer in it.
 *
 *  The two panels answer different questions and are not two lengths of the same
 *  list. The feed is history — it only grows, and a row stays true after the fact
 *  it describes stops mattering. "Cần chú ý" is read from the current snapshot on
 *  every render and empties itself the moment the player deals with the thing. */
export function ActivityColumn({ open, onReveal }: { open: boolean; onReveal: (id: SurfaceId) => void }) {
  const { state, pending, activity, setActivePanel, setAdvancedOpen } = useGame();
  const playerId = state.session?.player.id;
  const attention = playerId ? attentionItems(state.snapshot, pending, playerId) : [];

  /** Every anchor a row can carry lives inside the kingdom column, so the jump
   *  opens that column first. In a compact band it is a flyout over the map and
   *  the feed is the surface currently covering it, which is exactly the case
   *  `openSurface` handles by swapping one for the other. The 60ms is the same
   *  wait the column's own nav uses: `revealPanel` scrolls to an element, and in
   *  compact that element is inside a surface this click has only just opened. */
  const jump = (anchor: PanelAnchorId) => {
    onReveal("kingdom");
    if (anchor !== "hud") setActivePanel(anchor);
    if (anchor === "diplomacy") setAdvancedOpen(true);
    setTimeout(() => revealPanel(anchor), 60);
  };

  return <aside
    id={surfaceElementIds.activity}
    className="activity-column"
    aria-label="Dòng hoạt động"
    hidden={!open}
  >
    <Panel density="compact" accent="amber" className="activity-panel" aria-label="Cần chú ý">
      <PanelHeader title={<><Icon name="alert" size="sm" /> Cần chú ý</>} level={3} />
      <PanelBody>
        {attention.length === 0
          ? <p className="activity-empty">Chưa có gì cần chú ý.</p>
          : <ul className="activity-list">
            {attention.map(item => <AttentionRow key={item.id} item={item} onJump={jump} />)}
          </ul>}
      </PanelBody>
    </Panel>
    <Panel density="compact" accent="slate" className="activity-panel" aria-label="Hoạt động gần đây">
      <PanelHeader title={<><Icon name="clock" size="sm" /> Hoạt động gần đây</>} level={3} />
      <PanelBody>
        {activity.length === 0
          ? <p className="activity-empty">Chưa có hoạt động nào. Ra lệnh đầu tiên và nó sẽ hiện ở đây.</p>
          : <ul className="activity-list">
            {activity.map(event => <ActivityRow key={event.id} event={event} onJump={jump} />)}
          </ul>}
      </PanelBody>
    </Panel>
  </aside>;
}

/** `hh:mm`, with the machine-readable instant in `dateTime`. The feed is read as
 *  "did that land before or after I moved", which needs a clock rather than a
 *  "3 phút trước" that would have to re-render every minute to stay honest. */
const clock = (at: number) => new Date(at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/** One row: the kind's glyph, the sentence, the kind's chip in the state's
 *  colour, and the time. Exactly one glyph and one wording per row — the same
 *  pairing `activity.ts` declares and `ui-primitives.test.ts` pins.
 *
 *  A row with an anchor is a `Button`, not a `<div onClick>`: it moves focus,
 *  answers Enter and Space, and reaches the keyboard. A row without one is
 *  static text, because a control that goes nowhere is worse than plain text. */
function ActivityRow({ event, onJump }: { event: ActivityEvent; onJump: (anchor: PanelAnchorId) => void }) {
  const body = <>
    <Icon name={event.icon} size="sm" />
    <span className="activity-row__text">{event.message}</span>
    <span className="activity-row__meta">
      <StatusChip state={event.state} glyph="none">{activityKindLabels[event.kind]}</StatusChip>
      <time dateTime={new Date(event.at).toISOString()}>{clock(event.at)}</time>
    </span>
  </>;
  return <li className="activity-row" data-testid="activity-row" data-kind={event.kind}>
    {event.anchor
      ? <Button variant="ghost" density="compact" block className="activity-row__jump" onClick={() => onJump(event.anchor!)}>{body}</Button>
      : <span className="activity-row__static">{body}</span>}
  </li>;
}

function AttentionRow({ item, onJump }: { item: AttentionItem; onJump: (anchor: PanelAnchorId) => void }) {
  const body = <>
    <Icon name={item.icon} size="sm" />
    <span className="activity-row__text">{item.message}</span>
    <span className="activity-row__meta"><StatusChip state={item.state} glyph="none">Cần xử lý</StatusChip></span>
  </>;
  return <li className="activity-row" data-testid="attention-row">
    {item.anchor
      ? <Button variant="ghost" density="compact" block className="activity-row__jump" onClick={() => onJump(item.anchor!)}>{body}</Button>
      : <span className="activity-row__static">{body}</span>}
  </li>;
}

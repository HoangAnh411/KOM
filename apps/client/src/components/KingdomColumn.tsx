import { lazy, Suspense } from "react";
import { revealPanel, usePanelAnchor, type PanelAnchorId } from "../panel-anchors.js";
import { surfaceElementIds } from "../layout.js";
import { useGame, type PanelId } from "../state.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { StatusChip } from "../ui/Status.js";
import type { IconName } from "../ui/tokens.js";
import { ArmyPanel } from "./ArmyPanel.js";
import { CityPanel } from "./CityPanel.js";
import { LogisticsPanel } from "./LogisticsPanel.js";
import { OnboardingPanel } from "./OnboardingPanel.js";
import { offlineRetryReason } from "./PendingChip.js";

// The advanced drawer (alliance/espionage/archive/diplomacy) loads on first open.
const AdvancedDrawer = lazy(() => import("./AdvancedDrawer.js"));

/** The four jump targets. The icons used to be emoji, which meant the nav was
 *  rendered by whichever font the player's OS supplies for `U+1F3F0` — colour on
 *  one machine, a monochrome outline on the next, and a wider glyph than the
 *  label on both. These come from the same stroke set as the rest of the UI and
 *  inherit `currentColor`, so the active chip's text and its glyph change colour
 *  together. */
const navEntries: Array<{ id: PanelId & PanelAnchorId; label: string; icon: IconName }> = [
  { id: "city", label: "Thành phố", icon: "city" },
  { id: "army", label: "Quân đội", icon: "sword" },
  { id: "logistics", label: "Vận tải", icon: "caravan" },
  { id: "diplomacy", label: "Ngoại giao", icon: "treaty" },
];

/** The left column: the same panels the right-hand HUD carried before the
 *  redesign, moved to the side the eye reads first and given a sticky head so the
 *  city you are looking at and the jump controls never scroll away.
 *
 *  The old 64px navigation rail is folded into that head rather than kept as a
 *  separate column. It was only ever a set of jump links into these panels, and a
 *  rail plus a column is two navigation systems for one list. Its `<nav>`, its
 *  labels and its `activePanel` behaviour are unchanged — only its geometry is. */
export function KingdomColumn({ open }: { open: boolean }) {
  const {
    state, pending, connection, retryPending, advancedOpen, setAdvancedOpen, activePanel, setActivePanel,
  } = useGame();
  const session = state.session!;
  const anchor = usePanelAnchor<HTMLElement>("hud");
  const myCity = state.snapshot?.cities.find(item => item.playerId === session.player.id);
  const frozen = Boolean(myCity?.frozen);

  const scrollToPanel = (id: PanelId & PanelAnchorId) => {
    setActivePanel(id);
    if (id === "diplomacy") setAdvancedOpen(true);
    setTimeout(() => revealPanel(id), 60);
  };

  return <aside
    ref={anchor}
    id={surfaceElementIds.kingdom}
    className="kingdom-column"
    aria-label="Bảng điều khiển"
    data-frozen={frozen ? "true" : "false"}
    hidden={!open}
  >
    <div className="kingdom-column__head">
      <div className="hud-title"><h2 data-testid="city-name">{(myCity ?? state.snapshot?.cities[0])?.name ?? "Thành phố"}</h2><span className="hint">Bảng điều khiển</span></div>
      {/* The chip is the head's answer to "why is everything greyed out": the
          banner in the top bar says what happened, this says which surface it
          took. Icon glyph, because a lock has to survive being read in the same
          grey the disabled controls under it are wearing. */}
      {frozen && <StatusChip state="frozen" glyph="icon" />}
      <nav className="kingdom-nav" aria-label="Điều hướng">
        {navEntries.map(entry => <Button
          key={entry.id}
          variant="ghost"
          title={entry.label}
          aria-current={activePanel === entry.id ? "true" : undefined}
          onClick={() => scrollToPanel(entry.id)}
        ><Icon name={entry.icon} size="sm" /><span className="nav-label">{entry.label}</span></Button>)}
      </nav>
    </div>
    <OnboardingPanel />
    {/* Frozen is `disabled` on a fieldset, which is the only thing in the platform
        that disables every control inside it. The rule it replaces —
        `.hud-frozen … { pointer-events: none; opacity: .5 }` — only disabled the
        mouse: every button stayed in the tab order, still fired on Enter, and the
        text behind that opacity dropped under 3:1. `<summary>` is not a form
        control, so the drawer still opens; only what is inside it goes quiet.
        Onboarding stays outside — a checklist you can read is not a command. */}
    <fieldset className="kingdom-column__panels" disabled={frozen}>
      <CityPanel />
      <LogisticsPanel />
      <ArmyPanel />
      <details className="drawer" open={advancedOpen} onToggle={event => setAdvancedOpen((event.target as HTMLDetailsElement).open)}>
        <summary data-testid="advanced-drawer-toggle">Nâng cao (liên minh · tình báo · sự kiện · ngoại giao)</summary>
        {advancedOpen && <Suspense fallback={<p className="hint">Đang tải…</p>}><AdvancedDrawer /></Suspense>}
      </details>
    </fieldset>
    {/* The last bare `<section>` in the column, and the reason the `.hud section`
        rule could still be said to be load-bearing. It was also the one surface
        that rule actively broke: `.hud section` is (0,1,1) and out-specified
        `.pending-strip` at (0,1,0), so the strip rendered on `--kom-surface` with
        1rem of padding instead of the sunken box it declares for itself. As a
        compact `Panel` it gets both back, and keeps its own background because a
        same-specificity rule in this sheet beats the primitive's. */}
    {pending.length > 0 && <Panel density="compact" accent="slate" className="pending-strip" aria-label="Lệnh đang chờ">
      <PanelHeader title="Lệnh đang chờ" level={3} />
      <PanelBody>
        {pending.map(command => <div className="pending-row" data-testid="pending-command" key={command.commandId}>
          <span>{command.label} {command.status === "sending" ? "…đang gửi" : "— chưa xác nhận"}</span>
          {command.status === "uncertain" && <Button
            variant="ghost"
            density="compact"
            disabled={connection !== "online"}
            reason={offlineRetryReason}
            onClick={() => retryPending(command.commandId)}
          >Thử lại</Button>}
        </div>)}
      </PanelBody>
    </Panel>}
  </aside>;
}

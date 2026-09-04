import { useEffect, useMemo, useRef, useState } from "react";
import { bandForMatches, bandQueries, defaultSurfaces, shellClass, toggleSurface, type LayoutBand, type SurfaceId } from "../layout.js";
import { useGame } from "../state.js";
import { ActivityColumn } from "./ActivityColumn.js";
import { BattleReportModal } from "./BattleReportModal.js";
import { CommandTray } from "./CommandTray.js";
import { KingdomColumn } from "./KingdomColumn.js";
import { MapSurface } from "./MapSurface.js";
import { StrategicHeader } from "./StrategicHeader.js";

/** Which band CSS is currently in, read from the same media queries the
 *  stylesheet uses. React needs to know only because `aria-expanded` and the
 *  compact "one surface at a time" rule live in JS; the geometry itself is CSS's
 *  job and happens without this hook. */
function currentBand(): LayoutBand {
  if (typeof window === "undefined" || !window.matchMedia) return "wide";
  return bandForMatches(bandQueries.filter(query => window.matchMedia(query).matches).length);
}

function useLayoutBand(): LayoutBand {
  const [band, setBand] = useState<LayoutBand>(currentBand);
  useEffect(() => {
    const queries = bandQueries.map(query => window.matchMedia(query));
    const onChange = () => setBand(currentBand());
    for (const query of queries) query.addEventListener?.("change", onChange);
    onChange(); // The viewport can have moved between the first render and this effect.
    return () => { for (const query of queries) query.removeEventListener?.("change", onChange); };
  }, []);
  return band;
}

/** The shell. Five grid areas — header, kingdom, map, activity, tray — and the
 *  open/closed state of the two that can close.
 *
 *  What this component deliberately does *not* do is decide widths, or mount and
 *  unmount its children to fit the viewport. A closed surface stays rendered with
 *  `hidden` and its grid track collapses to zero; the map is a single
 *  unconditional `<MapSurface />` in every band. That is what keeps one Pixi
 *  Application alive from login to logout no matter how the layout moves. */
export function SituationRoom() {
  const { protocolBlocked, reports, dismissReport } = useGame();
  const band = useLayoutBand();
  const [surfaces, setSurfaces] = useState(() => defaultSurfaces(currentBand()));
  // Crossing a breakpoint re-establishes that band's defaults, but only on an
  // actual crossing: re-running this on mount would discard nothing, and
  // re-running it on every render would discard the player's own toggles.
  const applied = useRef(band);
  useEffect(() => {
    if (applied.current === band) return;
    applied.current = band;
    setSurfaces(defaultSurfaces(band));
  }, [band]);

  const report = useMemo(() => reports[0], [reports]);
  const toggle = (id: SurfaceId) => setSurfaces(current => toggleSurface(current, id, band));

  return <div className={shellClass(surfaces)}>
    <StrategicHeader surfaces={surfaces} onToggleSurface={toggle} />
    <KingdomColumn open={surfaces.kingdom} />
    <MapSurface />
    <ActivityColumn open={surfaces.activity} />
    <CommandTray />
    {protocolBlocked && <div className="protocol-banner" role="alert">{protocolBlocked}</div>}
    {report && <BattleReportModal report={report} onClose={dismissReport} />}
  </div>;
}

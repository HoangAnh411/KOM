import { useEffect, useState } from "react";
import { factions } from "@kingdoms/shared";
import { surfaceElementIds, type SurfaceId, type SurfaceState } from "../layout.js";
import { useGame } from "../state.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { resourceKeys, resourceLabels } from "../vocabulary.js";

const connectionLabels: Record<string, { label: string; className: string }> = {
  connecting: { label: "Đang kết nối…", className: "conn-connecting" },
  online: { label: "Trực tuyến", className: "conn-online" },
  reconnecting: { label: "Mất kết nối…", className: "conn-reconnecting" },
  offline: { label: "Ngoại tuyến", className: "conn-offline" },
};

/** Short labels: these two buttons sit at the end of a row that already has to
 *  fit four resource counters and a season countdown at 1024px. */
const surfaceLabels: Record<SurfaceId, string> = { kingdom: "Vương quốc", activity: "Hoạt động" };

/** Row 1 of the Situation Room: who you are, what you hold, how much season is
 *  left, and whether the server is still listening. It spans the full width and
 *  never collapses — it is the one surface that is always true no matter what is
 *  selected on the map.
 *
 *  It also owns the two column toggles. Putting them here rather than on the
 *  columns themselves is what makes a collapsed column reopenable: the control
 *  cannot disappear with the thing it controls. */
export function StrategicHeader({ surfaces, onToggleSurface }: {
  surfaces: SurfaceState;
  onToggleSurface: (id: SurfaceId) => void;
}) {
  const { state, connection, logout } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const city = snapshot.cities.find(item => item.playerId === session.player.id) ?? snapshot.cities[0];
  const score = snapshot.scores[session.player.id];
  const seasonSeconds = Math.max(0, Math.ceil((Date.parse(snapshot.season.endsAt) - now) / 1000));
  const conn = connectionLabels[connection];
  return <header className="strategic-header" role="banner">
    <div className="brand"><strong>{session.player.displayName}</strong><span>{factions[session.player.factionId].name} · <button className="link-button" onClick={logout}>Đăng xuất</button></span></div>
    {city.frozen && <div className="frozen-banner" role="status">Tài khoản đang bị khóa — thành phố, quân đội và caravan đã đóng băng.</div>}
    <div className="resource-grid">
      {resourceKeys.map(key => <div key={key}><span>{resourceLabels[key]}</span><strong className="kom-num" data-testid={`resource-${key}`}>{city.resources[key]}</strong></div>)}
    </div>
    <div className="season">Mùa còn <strong className="kom-num">{Math.floor(seasonSeconds / 60)}m {seasonSeconds % 60}s</strong> · ⚔ {score?.military ?? 0} · ◈ {score?.economy ?? 0} · ✦ {score?.diplomacy ?? 0}</div>
    <div className={`connection-pill ${conn.className}`} role="status"><span className="connection-dot" />{conn.label}</div>
    <div className="header-surfaces">
      {(Object.keys(surfaceLabels) as SurfaceId[]).map(id => <Button
        key={id}
        variant="ghost"
        density="compact"
        className={surfaces[id] ? "header-toggle header-toggle--on" : "header-toggle"}
        aria-expanded={surfaces[id]}
        aria-controls={surfaceElementIds[id]}
        onClick={() => onToggleSurface(id)}
      ><Icon name="eye" size="sm" />{surfaceLabels[id]}</Button>)}
    </div>
  </header>;
}

import { useEffect, useState } from "react";
import { factions } from "@kingdoms/shared";
import { surfaceElementIds, type SurfaceId, type SurfaceState } from "../layout.js";
import { usePanelJump } from "../panel-anchors.js";
import { useGame } from "../state.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import type { IconName } from "../ui/tokens.js";
import { resourceIcons, resourceKeys, resourceLabels } from "../vocabulary.js";
import { PlayerHubModal, type HubMode } from "./PlayerHubModal.js";
import { MenuModal } from "./MenuModal.js";

const connectionLabels: Record<string, { label: string; className: string }> = {
  connecting: { label: "Đang kết nối…", className: "conn-connecting" },
  online: { label: "Trực tuyến", className: "conn-online" },
  reconnecting: { label: "Mất kết nối…", className: "conn-reconnecting" },
  offline: { label: "Ngoại tuyến", className: "conn-offline" },
};

/** Short labels: these two buttons sit at the end of a row that already has to
 *  fit four resource counters and a season countdown at 1024px. */
const surfaceLabels: Record<SurfaceId, { label: string; icon: IconName }> = {
  kingdom: { label: "Vương quốc", icon: "city" },
  activity: { label: "Nhiệm vụ", icon: "clock" },
};

/** Row 1 of the Situation Room: who you are, what you hold, how much season is
 *  left, and whether the server is still listening. It spans the full width and
 *  never collapses — it is the one surface that is always true no matter what is
 *  selected on the map.
 *
 *  It also owns the two column toggles. Putting them here rather than on the
 *  columns themselves is what makes a collapsed column reopenable: the control
 *  cannot disappear with the thing it controls. */
export function StrategicHeader({ surfaces, onToggleSurface, onRevealSurface }: {
  surfaces: SurfaceState;
  onToggleSurface: (id: SurfaceId) => void;
  onRevealSurface?: (id: SurfaceId) => void;
}) {
  const { state, connection, logout, playerHub } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const [now, setNow] = useState(Date.now());
  const [hubMode, setHubMode] = useState<HubMode>();
  const [menuOpen, setMenuOpen] = useState(false);
  const revealSurface = onRevealSurface ?? onToggleSurface;
  const jumpToPanel = usePanelJump(revealSurface);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const city = snapshot.cities.find(item => item.playerId === session.player.id) ?? snapshot.cities[0];
  const score = snapshot.scores[session.player.id];
  const seasonSeconds = Math.max(0, Math.ceil((Date.parse(snapshot.season.endsAt) - now) / 1000));
  const conn = connectionLabels[connection];
  const scoreEntries: Array<{ icon: IconName; label: string; value: number }> = [
    { icon: "sword", label: "Điểm quân sự", value: score?.military ?? 0 },
    { icon: "caravan", label: "Điểm kinh tế", value: score?.economy ?? 0 },
    { icon: "treaty", label: "Điểm ngoại giao", value: score?.diplomacy ?? 0 },
  ];
  return <>
  <header className="strategic-header" role="banner">
    {/* The page's one `<h1>`. `AuthScreen` has the only other one in the client, and
        it unmounts at login — so from the moment the game appeared there was no
        `<h1>` on the page at all, and a screen reader jumping by heading landed in
        a panel. Your own kingdom is what the document is about; the level says so.
        Logout leaves the ellipsised text it used to live inside, where a long
        faction name could clip the only way to sign out. */}
    <Button variant="ghost" className="brand" onClick={() => setHubMode("profile")} aria-label="Mo ho so chi huy">
      <span className={`brand__crest brand__crest--${playerHub?.equipped.avatar_frame ?? "default"}`} aria-hidden="true">{session.player.displayName.slice(0, 1).toUpperCase()}</span>
      <span className={`brand__copy brand__nameplate--${playerHub?.equipped.nameplate ?? "default"}`}>
        <h1>{session.player.displayName}</h1>
        <span className="brand__line">{factions[session.player.factionId].name}</span>
      </span>
    </Button>
    {city.frozen && <div className="frozen-banner" role="status">Tài khoản đang bị khóa — thành phố, quân đội và caravan đã đóng băng.</div>}
    <div className="resource-grid" aria-label="Tai nguyen">
      {/* Glyph + number only: the word lives in the `aria-label` ("Gỗ: 120"),
          read in full by a screen reader, while the eye that has learned the
          four colours no longer re-reads "Lương thực" four times a minute. */}
      {resourceKeys.map(key => <Button key={key} variant="ghost" density="compact" className={`resource-counter resource-counter--${key}`} aria-label={`${resourceLabels[key]}: ${city.resources[key]}`} onClick={() => revealSurface("kingdom")}><Icon name={resourceIcons[key]} size="sm" /><strong className="kom-num" data-testid={`resource-${key}`}>{city.resources[key]}</strong></Button>)}
    </div>
    {/* The three scores were `⚔ ◈ ✦` — glyphs with no accessible name, announced as
        the punctuation they are and unreadable to anyone who had not been told what
        they meant. Same three icons the kingdom nav uses for the panels those
        scores come from, titled, so the pairing is learnable in one place. */}
    <div className="season">Mùa còn <strong className="kom-num">{Math.floor(seasonSeconds / 60)}m {seasonSeconds % 60}s</strong>
      {scoreEntries.map(entry => <span className="season__score" key={entry.icon}>
        <Icon name={entry.icon} size="sm" title={entry.label} />
        <strong className="kom-num">{entry.value}</strong>
      </span>)}
    </div>
    <div className={`connection-pill ${conn.className}`} role="status"><span className="connection-dot" />{conn.label}</div>
    <div className="header-surfaces">
      <Button variant="ghost" density="compact" className="header-toggle" data-header-tool="profile" onClick={() => setHubMode("profile")}><Icon name="banner" size="sm" /><span>Hồ sơ</span></Button>
      <Button variant="ghost" density="compact" className="header-toggle" data-header-tool="events" onClick={() => jumpToPanel("events")}><Icon name="alert" size="sm" /><span>Sự kiện</span></Button>
      <Button variant="ghost" density="compact" className="header-toggle" data-header-tool="army" onClick={() => jumpToPanel("army")}><Icon name="sword" size="sm" /><span>Đội hình</span></Button>
      <Button variant="ghost" density="compact" className="header-toggle" data-header-tool="inventory" onClick={() => setHubMode("inventory")}><Icon name="caravan" size="sm" /><span>Túi</span></Button>
      <Button variant="ghost" density="compact" className="header-toggle" data-header-tool="shop" onClick={() => setHubMode("shop")}><Icon name="banner" size="sm" /><span>Shop</span></Button>
      <Button variant="ghost" density="compact" className="header-toggle" data-header-tool="alliance" onClick={() => jumpToPanel("alliance")}><Icon name="treaty" size="sm" /><span>Liên minh</span></Button>
      <Button variant="ghost" density="compact" className="header-toggle" data-header-tool="reports" onClick={() => revealSurface("activity")}><Icon name="clock" size="sm" /><span>Báo cáo</span></Button>
      <Button variant="ghost" density="compact" className="header-toggle" data-header-tool="menu" onClick={() => setMenuOpen(true)}><Icon name="link-off" size="sm" /><span>Menu</span></Button>
      {(Object.keys(surfaceLabels) as SurfaceId[]).map(id => <Button
        key={id}
        variant="ghost"
        density="compact"
        className={surfaces[id] ? "header-toggle header-toggle--on" : "header-toggle"}
        data-header-tool={id}
        aria-expanded={surfaces[id]}
        aria-controls={surfaceElementIds[id]}
        onClick={() => onToggleSurface(id)}
      ><Icon name={surfaceLabels[id].icon} size="sm" /><span>{surfaceLabels[id].label}</span></Button>)}
      <Button variant="ghost" density="compact" className="header-toggle header-logout" data-header-tool="logout" onClick={logout}>
        <Icon name="link-off" size="sm" /><span>Thoát</span>
      </Button>
    </div>
  </header>
  {hubMode && <PlayerHubModal mode={hubMode} onClose={() => setHubMode(undefined)} />}
  {menuOpen && <MenuModal onClose={() => setMenuOpen(false)} />}
  </>;
}

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { factions, gameRules } from "@kingdoms/shared";
import type { MapSelection, WorldMap } from "./map.js";
import type { Army } from "@kingdoms/shared";
import { GameProvider, useGame, type PanelId } from "./state.js";
import { AuthScreen } from "./components/AuthScreen.js";
import { CityPanel } from "./components/CityPanel.js";
import { LogisticsPanel } from "./components/LogisticsPanel.js";
import { ArmyPanel } from "./components/ArmyPanel.js";
import { OnboardingPanel } from "./components/OnboardingPanel.js";
import { BattleReportModal } from "./components/BattleReportModal.js";
import { cancelable, hasEnemy, isOwnLiveArmy, mergeCandidates } from "./validation.js";

// The advanced drawer (alliance/espionage/archive/diplomacy) loads on first open.
const AdvancedDrawer = lazy(() => import("./components/AdvancedDrawer.js"));

const connectionLabels: Record<string, { label: string; className: string }> = {
  connecting: { label: "Đang kết nối…", className: "conn-connecting" },
  online: { label: "Trực tuyến", className: "conn-online" },
  reconnecting: { label: "Mất kết nối…", className: "conn-reconnecting" },
  offline: { label: "Ngoại tuyến", className: "conn-offline" },
};

const navEntries: Array<{ id: PanelId; label: string; icon: string; anchor?: string }> = [
  { id: "city", label: "Thành phố", icon: "🏰", anchor: ".city-panel" },
  { id: "army", label: "Quân đội", icon: "⚔", anchor: ".army-panel" },
  { id: "logistics", label: "Logistics", icon: "🚚", anchor: ".logistics-panel" },
  { id: "diplomacy", label: "Ngoại giao", icon: "🕊", anchor: ".diplomacy-panel" },
];

function TopBar() {
  const { state, connection, logout } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const city = snapshot.cities.find(item => item.playerId === session.player.id) ?? snapshot.cities[0];
  const score = snapshot.scores[session.player.id];
  const seasonSeconds = Math.max(0, Math.ceil((Date.parse(snapshot.season.endsAt) - now) / 1000));
  const conn = connectionLabels[connection];
  return <header className="top-bar" role="banner">
    <div className="brand"><strong>{session.player.displayName}</strong><span>{factions[session.player.factionId].name} · <button className="link-button" onClick={logout}>Đăng xuất</button></span></div>
    {city.frozen && <div className="frozen-banner" role="status">Tài khoản đang bị khóa — thành phố, quân đội và caravan đã đóng băng.</div>}
    <div className="resource-grid">
      {Object.entries(city.resources).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}
    </div>
    <div className="season">Mùa còn <strong>{Math.floor(seasonSeconds / 60)}m {seasonSeconds % 60}s</strong> · ⚔ {score?.military ?? 0} · ◈ {score?.economy ?? 0} · ✦ {score?.diplomacy ?? 0}</div>
    <div className={`connection-pill ${conn.className}`} role="status"><span className="connection-dot" />{conn.label}</div>
  </header>;
}

function GameShell() {
  const { state, addNotice, setSelection, selection, interaction, beginOrder, cancelOrder, runCommand, retryPending, pending, connection, protocolBlocked, advancedOpen, setAdvancedOpen, activePanel, setActivePanel, reports, dismissReport } = useGame();
  const session = state.session!;
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<WorldMap>();
  const sessionRef = useRef(session);
  const interactionRef = useRef(interaction);
  const [mergeTarget, setMergeTarget] = useState("");
  const [viewportOk, setViewportOk] = useState(() => (typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true));
  useEffect(() => { sessionRef.current = session; interactionRef.current = interaction; });
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setViewportOk(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const handleSelect = useCallback((picked: MapSelection | undefined) => {
    const snap = snapshotRef.current;
    const mode = interactionRef.current;
    if (mode.kind !== "idle") {
      if (mode.kind === "move" && picked) {
        const position = picked.kind === "tile"
          ? { x: picked.x, y: picked.y }
          : (snap?.armies.find(army => army.id === picked.id) ?? snap?.cities.find(city => city.id === picked.id));
        if (position && position.x !== undefined && position.y !== undefined) {
          runCommand({ kind: "move_army", label: "Lệnh di chuyển", path: "/api/commands/move-army", body: { armyId: mode.armyId, targetX: position.x, targetY: position.y } })
            .then(response => { if (response.result === "accepted") addNotice("Lệnh di chuyển đã ghi nhận.", "info"); }).catch(() => undefined);
        }
        cancelOrder();
        return;
      }
      if (mode.kind === "attack" && picked?.kind === "army") {
        runCommand({ kind: "attack", label: "Lệnh tấn công", path: "/api/commands/attack", body: { armyId: mode.armyId, targetArmyId: picked.id } })
          .then(response => { if (response.result === "accepted") addNotice("Lệnh tấn công đã ghi nhận.", "info"); }).catch(() => undefined);
        cancelOrder();
        return;
      }
      cancelOrder();
    }
    setSelection(picked);
    setMergeTarget("");
  }, [runCommand, setSelection, cancelOrder, addNotice]);

  const snapshotRef = useRef(state.snapshot);
  useEffect(() => { snapshotRef.current = state.snapshot; });

  // Map is dynamically imported after login so the pixi chunk never loads on the auth screen.
  useEffect(() => {
    if (!state.snapshot || !mapContainer.current) return;
    let cancelled = false;
    void import("./map.js").then(({ createWorldMap }) => {
      if (cancelled) return;
      map.current?.destroy();
      map.current = createWorldMap(mapContainer.current!, state.snapshot!, session.player.id, handleSelect);
      map.current.setInteraction(interactionRef.current);
    });
    return () => { cancelled = true; map.current?.destroy(); map.current = undefined; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token, handleSelect]);

  useEffect(() => { if (state.snapshot) map.current?.update(state.snapshot, selection); }, [state.snapshot, selection]);
  useEffect(() => { map.current?.setInteraction(interaction); }, [interaction]);

  const selectedArmy = selection?.kind === "army" ? state.snapshot?.armies.find(item => item.id === selection.id && item.strength > 0) : undefined;
  const selectedCity = selection?.kind === "city" ? state.snapshot?.cities.find(item => item.id === selection.id) : undefined;
  const unitName = (army: Army) => {
    if (army.npcKind === "raider") return "Băng cướp";
    if (army.npcKind === "migration") return "Đám di cư";
    const unit = gameRules.recruitment[army.unitType as keyof typeof gameRules.recruitment];
    return unit?.name ?? army.unitType;
  };
  const ownerName = (army: Army) => army.ownerPlayerId ? (state.snapshot?.cities.find(city => city.playerId === army.ownerPlayerId)?.playerName ?? "?") : "NPC";
  const mine = isOwnLiveArmy(selectedArmy, session.player.id);
  const mergeCandidatesFor = selectedArmy ? mergeCandidates(state.snapshot?.armies ?? [], selectedArmy, session.player.id) : [];
  const canOrder = (mode: "move" | "attack") => mine && (mode === "move" || hasEnemy(state.snapshot?.armies ?? [], session.player.id));

  const scrollToPanel = (id: PanelId) => {
    setActivePanel(id);
    if (id === "diplomacy") setAdvancedOpen(true);
    setTimeout(() => { const anchor = navEntries.find(entry => entry.id === id)?.anchor; if (anchor) document.querySelector<HTMLElement>(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
  };

  const report = useMemo(() => reports[0], [reports]);
  if (!viewportOk) return <div className="viewport-notice" role="status"><h1>Kingdoms of Meridian</h1><p>Viewport desktop chưa được hỗ trợ — vui lòng mở game trên màn hình rộng ít nhất 1024px.</p></div>;

  return <div className="shell">
    <TopBar />
    <nav className="nav-rail" aria-label="Điều hướng">
      {navEntries.map(entry => <button key={entry.id} className={activePanel === entry.id ? "nav-active" : ""} onClick={() => scrollToPanel(entry.id)} title={entry.label}><span className="nav-icon">{entry.icon}</span><span>{entry.label}</span></button>)}
    </nav>
    <div ref={mapContainer} className="map">
      <div className="map-toolbar"><button onClick={() => { const city = state.snapshot?.cities.find(item => item.playerId === session.player.id); if (city && map.current) map.current.focusCity(city.x, city.y); }}>Về thành phố của tôi</button></div>
    </div>
    {protocolBlocked && <div className="protocol-banner" role="alert">{protocolBlocked}</div>}

    <aside className={`hud${state.snapshot?.cities.find(city => city.playerId === session.player.id)?.frozen ? " hud-frozen" : ""}`}>
      <div className="hud-title"><h2>{(state.snapshot?.cities.find(item => item.playerId === session.player.id) ?? state.snapshot?.cities[0])?.name ?? "Thành phố"}</h2><span className="hint">Bảng điều khiển</span></div>
      <OnboardingPanel />
      <CityPanel />
      <LogisticsPanel />
      <ArmyPanel />
      <details className="drawer" open={advancedOpen} onToggle={event => setAdvancedOpen((event.target as HTMLDetailsElement).open)}>
        <summary>Nâng cao (liên minh · tình báo · sự kiện · ngoại giao)</summary>
        {advancedOpen && <Suspense fallback={<p className="hint">Đang tải…</p>}><AdvancedDrawer /></Suspense>}
      </details>
      {pending.length > 0 && <section className="pending-strip">
        <h3>Lệnh đang chờ</h3>
        {pending.map(command => <div className="pending-row" key={command.commandId}>
          <span>{command.label} {command.status === "sending" ? "…đang gửi" : "— chưa xác nhận"}</span>
          {command.status === "uncertain" && <button disabled={connection !== "online"} onClick={() => retryPending(command.commandId)}>Thử lại</button>}
        </div>)}
      </section>}
    </aside>

    <div className="action-bar map-inspector" role="region" aria-label="Lệnh cho lựa chọn">
      {interaction.kind !== "idle" ? (
        <div className="map-inspector-hint" role="status">{interaction.kind === "move" ? "Nhấp vào bản đồ để chọn điểm đến" : "Nhấp vào quân địch để ra lệnh tấn công"} <button onClick={cancelOrder}>Hủy</button></div>
      ) : selection?.kind === "army" && selectedArmy ? (
        <>
          <strong>{unitName(selectedArmy)} · {selectedArmy.strength}</strong>
          <span className="hint">{ownerName(selectedArmy)} · ⚔ {selectedArmy.strength} · ★ {selectedArmy.morale} · ⛽ {selectedArmy.supply}% · ({selectedArmy.x},{selectedArmy.y})</span>
          <div className="map-inspector-actions">
            <button disabled={!canOrder("move")} onClick={() => beginOrder("move", selectedArmy.id)}>Di chuyển</button>
            <button disabled={!canOrder("attack")} onClick={() => beginOrder("attack", selectedArmy.id)}>Tấn công</button>
            <select value={mergeTarget} onChange={event => setMergeTarget(event.target.value)} aria-label="Quân gộp vào đây">
              <option value="">Hợp nhất: chọn quân cùng loại cùng ô…</option>
              {mergeCandidatesFor.map(item => <option value={item.id} key={item.id}>QĐ {unitName(item)} ({item.strength})</option>)}
            </select>
            <button disabled={!mergeTarget} onClick={() => runCommand({ kind: "merge_army", label: "Hợp nhất quân", path: "/api/commands/merge-army", body: { sourceArmyId: mergeTarget, targetArmyId: selectedArmy.id } }).then(() => setMergeTarget("")).catch(() => undefined)}>Hợp nhất vào quân này</button>
            {cancelable(selectedArmy) && <button onClick={() => runCommand({ kind: "cancel_army_order", label: "Hủy lệnh", path: "/api/commands/cancel-army-order", body: { armyId: selectedArmy.id } }).catch(() => undefined)}>Hủy lệnh</button>}
          </div>
        </>
      ) : selection?.kind === "city" && selectedCity ? (
        <>
          <strong>{selectedCity.name}</strong>
          <span className="hint">{selectedCity.playerName} · ({selectedCity.x},{selectedCity.y})</span>
        </>
      ) : (
        <>
          <strong>{selection?.kind === "tile" ? `Ô đất (${selection.x},${selection.y})` : "Chưa chọn gì"}</strong>
          <span className="hint">{selection?.kind === "tile" ? "Chọn quân đội của bạn trên bản đồ để ra lệnh di chuyển hoặc tấn công." : "Nhấp vào quân đội, thành phố hoặc ô đất trên bản đồ."}</span>
        </>
      )}
    </div>

    {report && <BattleReportModal report={report} onClose={dismissReport} />}
  </div>;
}

function Root() {
  const { state, notices, dismissNotice } = useGame();
  return <main>
    {state.session && state.snapshot ? <GameShell /> : <AuthScreen />}
    {notices.map(notice => <div key={notice.id} className={`toast toast-${notice.kind}`} role="status" onClick={() => dismissNotice(notice.id)}>{notice.message}</div>)}
  </main>;
}

export default function App() {
  return <GameProvider><Root /></GameProvider>;
}
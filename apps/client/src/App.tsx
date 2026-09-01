import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api.js";
import type { MapInteraction, MapSelection } from "./map.js";
import { createWorldMap } from "./map.js";
import { gameRules } from "@kingdoms/shared";
import { GameProvider, useGame } from "./state.js";
import { AuthScreen } from "./components/AuthScreen.js";
import { Hud } from "./components/Hud.js";
import { BattleReportModal } from "./components/BattleReportModal.js";

function GameShell() {
  const { state, applySnapshot, addNotice, setSession, logout, reports, pushReport, dismissReport } = useGame();
  const session = state.session!;
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<ReturnType<typeof createWorldMap>>();
  const interaction = useRef<MapInteraction>({ mode: "idle" });
  const sessionRef = useRef(session);
  const snapshotRef = useRef(state.snapshot);
  const lastRefreshAt = useRef(0);
  const [selection, setSelection] = useState<MapSelection>();
  const [pendingOrder, setPendingOrder] = useState<{ mode: "move" | "attack"; title: string }>();
  const [mergeTarget, setMergeTarget] = useState("");
  useEffect(() => { sessionRef.current = session; snapshotRef.current = state.snapshot; });

  const handleSelect = (picked: MapSelection | undefined) => {
    const action = interaction.current;
    const snap = snapshotRef.current;
    const token = sessionRef.current.token;
    if (action.mode !== "idle" && action.commanderArmyId) {
      if (action.mode === "move" && picked) {
        const position = picked.kind === "tile"
          ? { x: picked.x, y: picked.y }
          : (snap?.armies.find(army => army.id === picked.id) ?? snap?.cities.find(city => city.id === picked.id));
        if (position && position.x !== undefined && position.y !== undefined) {
          api.moveArmy(token, action.commanderArmyId, position.x, position.y)
            .then(() => addNotice("Lệnh di chuyển đã ghi nhận.", "info"))
            .catch(error => addNotice(error.message));
        }
        action.mode = "idle"; setPendingOrder(undefined);
        return;
      }
      if (action.mode === "attack" && picked?.kind === "army") {
        api.attack(token, action.commanderArmyId, picked.id)
          .then(() => addNotice("Lệnh tấn công đã ghi nhận.", "info"))
          .catch(error => addNotice(error.message));
        action.mode = "idle"; setPendingOrder(undefined);
        return;
      }
      action.mode = "idle"; setPendingOrder(undefined);
    }
    setSelection(picked);
    interaction.current.selectedArmyId = picked?.kind === "army" ? picked.id : undefined;
    setMergeTarget("");
  };

  useEffect(() => {
    sessionRef.current = session;
    if (!state.snapshot || !mapContainer.current) return;
    map.current?.destroy();
    const worldMap = createWorldMap(mapContainer.current, state.snapshot, session.player.id, interaction.current, handleSelect);
    map.current = worldMap;
    const connection = api.openSocket({
      getToken: () => sessionRef.current?.token ?? "",
      onSnapshot: applySnapshot,
      onError: addNotice,
      onBattleReport: pushReport,
      onAttackCanceled: (payload) => {
        const army = snapshotRef.current?.armies.find(item => item.id === payload.armyId);
        if (army && army.ownerPlayerId === sessionRef.current?.player.id) {
          addNotice(payload.reason === "target_destroyed" ? "Lệnh tấn công bị hủy: mục tiêu đã bị tiêu diệt." : "Lệnh tấn công bị hủy: mục tiêu đang bị đóng băng.", "info");
        }
      },
      onAuthExpired: (reason) => {
        if (import.meta.env.VITE_AUTH_MODE === "password") {
          // Refresh at most once per 4401 cycle; a banned token would otherwise spin refresh ↔ reconnect.
          if (Date.now() - lastRefreshAt.current < 5000) {
            addNotice("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
            logout();
            return;
          }
          lastRefreshAt.current = Date.now();
          void api.refresh().then(next => { setSession(next); addNotice("Đã kết nối lại phiên chơi.", "info"); })
            .catch(() => { addNotice("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại."); logout(); });
        } else if (reason === "ACCOUNT_BANNED") {
          // Keep the HUD so the frozen state stays visible; commands are rejected server-side.
          addNotice("Tài khoản đã bị khóa.", "info");
        } else {
          addNotice("Phiên chơi đã hết hạn, vui lòng đăng nhập lại.");
          logout();
        }
      },
    });
    return () => { connection.close(); worldMap.destroy(); if (map.current === worldMap) map.current = undefined; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  useEffect(() => { if (state.snapshot) map.current?.update(state.snapshot); }, [state.snapshot]);

  // Redraw as soon as a selection changes so the ring appears without waiting
  // for the next server snapshot.
  useEffect(() => {
    interaction.current.selectedArmyId = selection?.kind === "army" ? selection.id : undefined;
    if (state.snapshot) map.current?.update(state.snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const report = useMemo(() => reports[0], [reports]);
  const selectedArmy = selection?.kind === "army" ? state.snapshot?.armies.find(item => item.id === selection.id && item.strength > 0) : undefined;
  const selectedCity = selection?.kind === "city" ? state.snapshot?.cities.find(item => item.id === selection.id) : undefined;
  const unitName = (army: NonNullable<typeof selectedArmy>) => {
    if (army.npcKind === "raider") return "Băng cướp";
    if (army.npcKind === "migration") return "Đám di cư";
    const unit = gameRules.recruitment[army.unitType as keyof typeof gameRules.recruitment];
    return unit?.name ?? army.unitType;
  };
  const ownerName = (army: NonNullable<typeof selectedArmy>) => army.ownerPlayerId ? (state.snapshot?.cities.find(city => city.playerId === army.ownerPlayerId)?.playerName ?? "?") : "NPC";
  const beginOrder = (mode: "move" | "attack", armyId: string) => {
    interaction.current.commanderArmyId = armyId;
    interaction.current.mode = mode;
    setPendingOrder({ mode, title: mode === "move" ? "Nhấp vào bản đồ để chọn điểm đến" : "Nhấp vào quân địch để ra lệnh tấn công" });
  };
  const cancelOrder = () => {
    interaction.current.mode = "idle";
    interaction.current.commanderArmyId = undefined;
    setPendingOrder(undefined);
  };

  return <>
    <div ref={mapContainer} className="map" />
    <div className="map-toolbar"><button onClick={() => { const city = state.snapshot?.cities.find(item => item.playerId === session.player.id); if (city && map.current) map.current.focusCity(city.x, city.y); }}>Về thành phố của tôi</button></div>
    {pendingOrder && <div className="map-inspector map-inspector-hint" role="status">{pendingOrder.title} <button onClick={cancelOrder}>Hủy</button></div>}
    {!pendingOrder && selection?.kind === "army" && selectedArmy && (() => {
      const army = selectedArmy;
      const mine = army.ownerPlayerId === session.player.id && !army.frozen;
      const candidates = state.snapshot?.armies.filter(item => item.ownerPlayerId === session.player.id && item.id !== army.id && item.strength > 0 && item.unitType === army.unitType && item.x === army.x && item.y === army.y) ?? [];
      return <div className="map-inspector">
        <strong>{unitName(army)} · {army.strength}</strong>
        <span className="hint">{ownerName(army)}</span>
        <span className="hint">⚔ {army.strength} · ★ {army.morale} · ⛽ {army.supply}% · ({army.x},{army.y})</span>
        {mine && <>
          <div className="map-inspector-actions">
            <button onClick={() => beginOrder("move", army.id)}>Di chuyển</button>
            <button disabled={army.attackOrder !== undefined || army.targetX !== undefined} onClick={() => beginOrder("attack", army.id)}>Tấn công</button>
            {army.attackOrder || army.targetX !== undefined ? <button onClick={() => api.cancelArmyOrder(session.token, army.id).catch(error => addNotice(error.message))}>Hủy lệnh</button> : null}
          </div>
          <div className="map-inspector-actions">
            <select value={mergeTarget} onChange={event => setMergeTarget(event.target.value)} aria-label="Quân gộp vào đây">
              <option value="">Hợp nhất: chọn quân cùng loại cùng ô…</option>
              {candidates.map(item => <option value={item.id} key={item.id}>QĐ {unitName(item)} ({item.strength})</option>)}
            </select>
            <button disabled={!mergeTarget} onClick={() => api.mergeArmies(session.token, mergeTarget, army.id).then(() => setMergeTarget("")).catch(error => addNotice(error.message))}>Hợp nhất vào quân này</button>
          </div>
        </>}
      </div>;
    })()}
    {!pendingOrder && selection?.kind === "city" && selectedCity && (
      <div className="map-inspector">
        <strong>{selectedCity.name}</strong>
        <span className="hint">{selectedCity.playerName} · ({selectedCity.x},{selectedCity.y})</span>
      </div>
    )}
    {!pendingOrder && selection?.kind === "tile" && (
      <div className="map-inspector">
        <strong>Ô đất ({selection.x},{selection.y})</strong>
        <span className="hint">Chọn quân đội của bạn trên bản đồ để ra lệnh di chuyển hoặc tấn công.</span>
      </div>
    )}
    <Hud />
    {report && <BattleReportModal report={report} onClose={dismissReport} />}
  </>;
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
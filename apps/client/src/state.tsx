import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { BattleReport, WorldSnapshot } from "@kingdoms/shared";
import * as api from "./api.js";

export type Notice = { id: number; message: string; kind: "error" | "info" };

type GameState = { session?: api.Session; snapshot?: WorldSnapshot };
type GameAction =
  | { type: "session"; session: api.Session }
  | { type: "snapshot"; snapshot: WorldSnapshot }
  | { type: "logout" };

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "session": return { session: action.session, snapshot: action.session.snapshot };
    case "snapshot": return state.session ? { ...state, snapshot: action.snapshot } : state;
    case "logout": return {};
  }
}

type GameContextValue = {
  state: GameState;
  setSession: (session: api.Session) => void;
  applySnapshot: (snapshot: WorldSnapshot) => void;
  logout: () => void;
  notices: Notice[];
  addNotice: (message: string, kind?: Notice["kind"]) => void;
  dismissNotice: (id: number) => void;
  reports: BattleReport[];
  pushReport: (report: BattleReport) => void;
  dismissReport: () => void;
};

const GameContext = createContext<GameContextValue | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, {});
  const [notices, setNotices] = useState<Notice[]>([]);
  const [reports, setReports] = useState<BattleReport[]>([]);
  const nextNoticeId = useRef(1);
  const sessionRef = useRef(state.session);
  useEffect(() => { sessionRef.current = state.session; });

  const addNotice = useCallback((message: string, kind: Notice["kind"] = "error") => {
    const id = nextNoticeId.current++;
    setNotices(list => [...list, { id, message, kind }].slice(-5));
  }, []);
  const dismissNotice = useCallback((id: number) => setNotices(list => list.filter(item => item.id !== id)), []);
  const applySnapshot = useCallback((snapshot: WorldSnapshot) => dispatch({ type: "snapshot", snapshot }), []);
  const setSession = useCallback((session: api.Session) => dispatch({ type: "session", session }), []);
  const logout = useCallback(() => {
    void api.logout().catch(() => undefined);
    sessionStorage.removeItem("kingdoms-session");
    dispatch({ type: "logout" });
    sessionRef.current = undefined;
  }, []);
  const dismissReport = useCallback(() => setReports(list => list.slice(1)), []);

  // Commands apply their HTTP-response snapshot immediately (WS is secondary).
  useEffect(() => { api.setSnapshotSink(applySnapshot); return () => api.setSnapshotSink(undefined); }, [applySnapshot]);

  // Session bootstrap: password mode refreshes the cookie session; dev mode
  // restores the stored dev token and re-logs-in if the server forgot it.
  useEffect(() => {
    let cancelled = false;
    if (import.meta.env.VITE_AUTH_MODE === "password") {
      void api.refresh().then(next => { if (!cancelled) dispatch({ type: "session", session: next }); }).catch(() => undefined);
      return;
    }
    const saved = sessionStorage.getItem("kingdoms-session");
    if (!saved) return;
    let parsed: Pick<api.Session, "token" | "player">;
    try {
      parsed = JSON.parse(saved) as Pick<api.Session, "token" | "player">;
    } catch { sessionStorage.removeItem("kingdoms-session"); return; }
    void api.restoreSession(parsed.token, parsed.player).then(next => { if (!cancelled) dispatch({ type: "session", session: next }); })
      .catch(async () => {
        if (cancelled) return;
        try {
          const next = await api.login(parsed.player.displayName, parsed.player.factionId);
          sessionStorage.setItem("kingdoms-session", JSON.stringify({ token: next.token, player: next.player }));
          if (!cancelled) dispatch({ type: "session", session: next });
        } catch { /* stay on the auth screen */ }
      });
    return () => { cancelled = true; };
  }, []);

  // Silently rotate the access token shortly before it expires.
  useEffect(() => {
    const accessExpiresAt = state.session?.accessExpiresAt;
    if (import.meta.env.VITE_AUTH_MODE !== "password" || !accessExpiresAt) return;
    const delay = Math.max(1000, Date.parse(accessExpiresAt) - Date.now() - 30_000);
    const timer = setTimeout(() => {
      void api.refresh().then(next => { if (sessionRef.current) dispatch({ type: "session", session: next }); })
        .catch(() => { if (sessionRef.current) { dispatch({ type: "logout" }); addNotice("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại."); } });
    }, delay);
    return () => clearTimeout(timer);
  }, [state.session?.accessExpiresAt, addNotice]);

  // Battle reports include every kingdom-wide fight; keep only our own.
  const pushReport = useCallback((report: BattleReport) => {
    const playerId = sessionRef.current?.player.id;
    const mine = !!playerId && (report.attacker.playerId === playerId || report.defender.playerId === playerId);
    if (!mine) return;
    setReports(list => (list.some(item => item.id === report.id) ? list : [...list, report]));
  }, []);

  const value = useMemo(() => ({ state, setSession, applySnapshot, logout, notices, addNotice, dismissNotice, reports, pushReport, dismissReport }), [state, setSession, applySnapshot, logout, notices, addNotice, dismissNotice, reports, pushReport, dismissReport]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) throw new Error("useGame must be used inside <GameProvider>");
  return value;
}
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { BattleReport, CommandResponse, WorldSnapshot } from "@kingdoms/shared";
import { deriveActivity, type ActivityEvent, type ActivityInput } from "./activity.js";
import { errorMessage } from "./api.js";
import * as api from "./api.js";
import { beginPending, markUncertain, resolvePending, restorePending, savePending, type ClientCommand, type PendingCommand } from "./commands.js";
import type { ConnectionState } from "./connect.js";
import { shouldNotifyRestore } from "./connect.js";
import { protocolBlockedMessage } from "./protocol.js";
import type { MapSelection } from "./map.js";

export type Notice = { id: number; message: string; kind: "error" | "info" };
export type InteractionMode = { kind: "idle" } | { kind: "move"; armyId: string } | { kind: "attack"; armyId: string };
export type PanelId = "city" | "army" | "logistics" | "diplomacy" | "advanced";

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
  connection: ConnectionState;
  pending: PendingCommand[];
  runCommand: (command: ClientCommand) => Promise<CommandResponse>;
  retryPending: (commandId: string) => void;
  selection: MapSelection | undefined;
  setSelection: (selection: MapSelection | undefined) => void;
  interaction: InteractionMode;
  beginOrder: (mode: "move" | "attack", armyId: string) => void;
  cancelOrder: () => void;
  activePanel: PanelId;
  setActivePanel: (panel: PanelId) => void;
  advancedOpen: boolean;
  setAdvancedOpen: (open: boolean) => void;
  protocolBlocked: string | undefined;
  notices: Notice[];
  addNotice: (message: string, kind?: Notice["kind"]) => void;
  dismissNotice: (id: number) => void;
  reports: BattleReport[];
  pushReport: (report: BattleReport) => void;
  dismissReport: () => void;
  /** The activity column's feed: derived from the four sources below, never fetched. */
  activity: ActivityEvent[];
};

const GameContext = createContext<GameContextValue | undefined>(undefined);

const COMMAND_TIMEOUT_MS = 10_000;

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, {});
  const [notices, setNotices] = useState<Notice[]>([]);
  const [reports, setReports] = useState<BattleReport[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const connectionRef = useRef<ConnectionState>("connecting");
  const [pending, setPending] = useState<PendingCommand[]>([]);
  const pendingRef = useRef<PendingCommand[]>([]);
  const inFlightRef = useRef(new Map<string, Promise<CommandResponse>>());
  const [selection, setSelection] = useState<MapSelection | undefined>();
  const [interaction, setInteraction] = useState<InteractionMode>({ kind: "idle" });
  const [activePanel, setActivePanel] = useState<PanelId>("city");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const nextNoticeId = useRef(1);
  const lastRefreshAtRef = useRef(0);
  const sessionRef = useRef(state.session);
  const snapshotRef = useRef(state.snapshot);
  useEffect(() => { sessionRef.current = state.session; snapshotRef.current = state.snapshot; });

  // Pending commands live in a ref (synchronous reads for dedupe/retry) and
  // are mirrored to state for rendering; every change is persisted.
  const updatePending = useCallback((updater: (items: PendingCommand[]) => PendingCommand[]) => {
    pendingRef.current = updater(pendingRef.current);
    setPending(pendingRef.current);
    const playerId = sessionRef.current?.player.id;
    if (playerId) savePending(sessionStorage, playerId, pendingRef.current);
  }, []);

  const dismissNotice = useCallback((id: number) => setNotices(list => list.filter(item => item.id !== id)), []);
  /** The feed is appended to from the places that already learn something: no
   *  extra effect, no timer, no second subscription. `deriveActivity` returns the
   *  same array when a fact is already in the ring, so a repeated snapshot costs
   *  one comparison and no render. */
  const recordActivity = useCallback((input: ActivityInput) => setActivity(list => deriveActivity(list, input, Date.now())), []);
  const addNotice = useCallback((message: string, kind: Notice["kind"] = "error") => {
    const id = nextNoticeId.current++;
    setNotices(list => [...list, { id, message, kind }].slice(-5));
    // Transient by nature: an undismissed toast must never block the UI forever.
    window.setTimeout(() => dismissNotice(id), 4000);
  }, [dismissNotice]);
  const applySnapshot = useCallback((snapshot: WorldSnapshot) => {
    // `snapshotRef` is written by a post-render effect, so here it still holds the
    // snapshot this one replaces — the diff seam, with no extra state to keep.
    const playerId = sessionRef.current?.player.id;
    if (playerId) recordActivity({ source: "snapshot", previous: snapshotRef.current, next: snapshot, playerId });
    dispatch({ type: "snapshot", snapshot });
  }, [recordActivity]);
  const setSession = useCallback((session: api.Session) => dispatch({ type: "session", session }), []);
  const logout = useCallback(() => {
    void api.logout().catch(() => undefined);
    sessionStorage.removeItem("kingdoms-session");
    if (sessionRef.current) sessionStorage.removeItem(`kingdoms-pending-${sessionRef.current.player.id}`);
    pendingRef.current = [];
    setPending([]);
    // The feed is about one player's world; leaving it up would show the next
    // login somebody else's history in the same tab.
    setActivity([]);
    sessionRef.current = undefined;
    dispatch({ type: "logout" });
  }, []);
  const dismissReport = useCallback(() => setReports(list => list.slice(1)), []);
  const beginOrder = useCallback((mode: "move" | "attack", armyId: string) => setInteraction({ kind: mode, armyId }), []);
  const cancelOrder = useCallback(() => setInteraction({ kind: "idle" }), []);

  const protocolBlocked = useMemo(() => protocolBlockedMessage(state.snapshot), [state.snapshot]);

  const perform = useCallback(async (command: ClientCommand, commandId: string): Promise<CommandResponse> => {
    const token = sessionRef.current?.token;
    if (!token) throw new Error("Chưa đăng nhập.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);
    try {
      return await api.sendCommand(token, command.path, command.body, commandId, controller.signal);
    } finally { clearTimeout(timer); }
  }, []);

  const settle = useCallback((commandId: string, response: CommandResponse) => {
    // Read the label before `resolvePending` drops the entry: the feed row says
    // which order settled ("Xây kho"), not which uuid did.
    const entry = pendingRef.current.find(item => item.commandId === commandId);
    updatePending(items => resolvePending(items, commandId));
    const detail = response.result === "rejected" ? (response.code ? errorMessage(response.code) : "Lệnh bị từ chối.") : undefined;
    if (entry) recordActivity({ source: "command", commandId, label: entry.label, result: response.result, detail });
    if (response.result === "rejected") addNotice(detail!);
  }, [updatePending, addNotice, recordActivity]);

  /** Sends a command: id minted BEFORE the HTTP request, sync pending blocks
   * double-clicks, network/timeout failures downgrade the entry to
   * "uncertain" (no auto-retry; the player presses Thử lại). */
  const runCommand = useCallback(async (command: ClientCommand): Promise<CommandResponse> => {
    const blocked = protocolBlockedMessage(snapshotRef.current);
    if (blocked) { addNotice(blocked); throw new Error(blocked); }
    if (connectionRef.current !== "online") { addNotice("Chưa kết nối máy chủ — không thể gửi lệnh lúc này."); throw new Error("offline"); }
    const { pending: next, commandId, dedupe } = beginPending(pendingRef.current, command, Date.now(), () => crypto.randomUUID());
    if (dedupe) {
      const inFlight = inFlightRef.current.get(commandId);
      if (inFlight) return inFlight;
      // beginPending and inFlightRef are updated synchronously, so this is only
      // a defensive recovery if their invariants are ever broken.
      throw new Error("COMMAND_IN_FLIGHT_MISSING");
    }
    updatePending(() => next);
    const inFlight = perform(command, commandId)
      .then(response => { settle(commandId, response); return response; })
      .catch(error => {
        updatePending(items => markUncertain(items, commandId, Date.now()));
        recordActivity({ source: "command-uncertain", commandId, label: command.label });
        addNotice("Mất kết nối máy chủ khi gửi lệnh — lệnh chưa xác nhận, hãy thử lại.", "info");
        throw error instanceof Error ? error : new Error("network");
      })
      .finally(() => { inFlightRef.current.delete(commandId); });
    inFlightRef.current.set(commandId, inFlight);
    return inFlight;
  }, [addNotice, updatePending, perform, settle, recordActivity]);

  /** Manual retry of an uncertain command: same id, path and body. */
  const retryPending = useCallback((commandId: string) => {
    if (connectionRef.current !== "online") { addNotice("Chưa kết nối máy chủ."); return; }
    const entry = pendingRef.current.find(item => item.commandId === commandId);
    if (!entry || entry.status !== "uncertain") return;
    updatePending(items => items.map(item => item.commandId === commandId && item.status === "uncertain" ? { ...item, status: "sending" as const, startedAt: Date.now() } : item));
    void perform(entry, commandId)
      .then(response => settle(commandId, response))
      .catch(() => {
        updatePending(items => markUncertain(items, commandId, Date.now()));
        recordActivity({ source: "command-uncertain", commandId, label: entry.label });
        addNotice("Vẫn chưa tới máy chủ — thử lại khi kết nối ổn định.", "info");
      });
  }, [addNotice, updatePending, perform, settle, recordActivity]);

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

  // Socket lifecycle per session: restore uncertain commands, drive the
  // connection state, and announce a restore exactly once per outage.
  useEffect(() => {
    const token = state.session?.token;
    if (!token) return;
    updatePending(() => restorePending(sessionStorage, state.session!.player.id, Date.now()));
    let everOnline = false;
    const connectionHandle = api.openSocket({
      getToken: () => sessionRef.current?.token ?? "",
      onSnapshot: applySnapshot,
      onError: addNotice,
      onBattleReport: pushReport,
      onAttackCanceled: (payload) => {
        const army = snapshotRef.current?.armies.find(item => item.id === payload.armyId);
        if (army && army.ownerPlayerId === sessionRef.current?.player.id) {
          const message = payload.reason === "target_destroyed" ? "Lệnh tấn công bị hủy: mục tiêu đã bị tiêu diệt." : "Lệnh tấn công bị hủy: mục tiêu đang bị đóng băng.";
          addNotice(message, "info");
          // Keyed by the pair, not by the clock: a socket that redelivers the
          // same cancellation must not add the row twice.
          recordActivity({ source: "notice", id: `order-canceled:${payload.armyId}:${payload.targetArmyId}`, kind: "order-canceled", message });
        }
      },
      onConnectionState: (next) => {
        const previous = connectionRef.current;
        connectionRef.current = next;
        setConnection(next);
        // Mark the session once the handshake really completes; announce only
        // when an already-online session re-establishes after an outage.
        if (everOnline && shouldNotifyRestore(previous, next)) {
          addNotice("Đã kết nối lại phiên chơi.", "info");
          recordActivity({ source: "notice", id: `connection:${Date.now()}`, kind: "connection", message: "Đã kết nối lại phiên chơi.", state: "success", icon: "check" });
        }
        if (next === "online") everOnline = true;
      },
      onAuthExpired: (reason) => {
        if (import.meta.env.VITE_AUTH_MODE === "password") {
          // Refresh at most once per 4401 cycle; a banned token would otherwise spin refresh ↔ reconnect.
          if (Date.now() - lastRefreshAtRef.current < 5000) {
            addNotice("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
            logout();
            return;
          }
          lastRefreshAtRef.current = Date.now();
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
    return () => connectionHandle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.session?.token]);

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
    recordActivity({ source: "report", report, playerId: playerId! });
    setReports(list => (list.some(item => item.id === report.id) ? list : [...list, report]));
  }, [recordActivity]);

  const value = useMemo(() => ({ state, setSession, applySnapshot, logout, connection, pending, runCommand, retryPending, selection, setSelection, interaction, beginOrder, cancelOrder, activePanel, setActivePanel, advancedOpen, setAdvancedOpen, protocolBlocked, notices, addNotice, dismissNotice, reports, pushReport, dismissReport, activity }),
    [state, setSession, applySnapshot, logout, connection, pending, runCommand, retryPending, selection, setSelection, interaction, beginOrder, cancelOrder, activePanel, setActivePanel, advancedOpen, setAdvancedOpen, protocolBlocked, notices, addNotice, dismissNotice, reports, pushReport, dismissReport, activity]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) throw new Error("useGame must be used inside <GameProvider>");
  return value;
}

import type { BattleReport, CommandResponse, FactionId, SeasonArchive, WorldSnapshot } from "@kingdoms/shared";
import { gameRules } from "@kingdoms/shared";
import { errorMessage } from "./errors.js";

// VITE_API_URL wins when set (e2e/CI point it at a dedicated API); otherwise
// a dev page served from 127.0.0.1 assumes the local API on port 3000.
const configuredApiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
export const apiBase = import.meta.env.VITE_API_URL || (typeof window !== "undefined" && window.location.hostname === "127.0.0.1" ? "http://127.0.0.1:3000" : configuredApiBase);
export type Session = { token: string; player: { id: string; displayName: string; factionId: FactionId }; snapshot: WorldSnapshot; accessExpiresAt?: string };

export { errorMessage };

export class ApiError extends Error {
  code: string;
  constructor(code: string) { super(errorMessage(code)); this.code = code; }
}

let currentAccessToken: string | undefined;
let snapshotSink: ((snapshot: WorldSnapshot) => void) | undefined;
/** The game store registers here so command responses can apply their snapshot immediately. */
export function setSnapshotSink(sink: ((snapshot: WorldSnapshot) => void) | undefined): void { snapshotSink = sink; }

async function readSession(response: Response): Promise<Session> { const session = await response.json() as Session; currentAccessToken = session.token; return session; }
async function authorizedFetch(token: string, input: string, init: RequestInit = {}): Promise<Response> {
  const send = (accessToken: string) => fetch(input, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${accessToken}` } });
  let response = await send(currentAccessToken ?? token);
  if (response.status === 401 && import.meta.env.VITE_AUTH_MODE === "password") { const session = await refresh(); response = await send(session.token); }
  return response;
}

export async function login(displayName: string, factionId: FactionId): Promise<Session> {
  const response = await fetch(`${apiBase}/api/auth/dev`, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ displayName, factionId }) });
  if (!response.ok) throw new ApiError(((await response.json()) as { code?: string }).code ?? "INVALID_REQUEST");
  return readSession(response);
}

export async function restoreSession(token: string, player: Session["player"]): Promise<Session> {
  const response = await authorizedFetch(token, `${apiBase}/api/bootstrap`);
  if (!response.ok) throw new ApiError("SESSION_EXPIRED");
  const result = await response.json() as { snapshot: WorldSnapshot };
  currentAccessToken = token; return { token, player, snapshot: result.snapshot };
}

export type AttackCanceledPayload = { armyId: string; targetArmyId: string; reason: "target_destroyed" | "target_frozen" };
export type SocketHandlers = {
  /** Current access token; re-read on every (re)connect so a refreshed session re-auths. */
  getToken: () => string;
  onSnapshot: (snapshot: WorldSnapshot) => void;
  onError: (message: string) => void;
  onBattleReport: (report: BattleReport) => void;
  onAttackCanceled: (payload: AttackCanceledPayload) => void;
  /** Called once on 4401 (bad/expired token) with the server's close reason; the caller refreshes or logs out. */
  onAuthExpired: (reason: string) => void;
};

/** Authenticated WebSocket with backoff reconnect (1s → 2s → 4s → 8s, cap 10s). */
export function openSocket(handlers: SocketHandlers): { close: () => void } {
  const delays = [1000, 2000, 4000, 8000, 10000];
  let attempt = 0;
  let stopped = false;
  let socket: WebSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const connect = () => {
    if (stopped) return;
    socket = new WebSocket(`${apiBase.replace(/^http/, "ws")}/ws`);
    socket.addEventListener("open", () => {
      attempt = 0;
      socket?.send(JSON.stringify({ type: "AUTH", token: handlers.getToken() }));
    });
    socket.addEventListener("message", (event) => {
      let message: { type?: string; payload?: unknown; code?: string; message?: string };
      try { message = JSON.parse(event.data as string) as { type?: string; payload?: unknown; code?: string; message?: string }; } catch { return; }
      switch (message.type) {
        case "SNAPSHOT": if (message.payload) handlers.onSnapshot(message.payload as WorldSnapshot); break;
        case "BATTLE_REPORT": if (message.payload) handlers.onBattleReport(message.payload as BattleReport); break;
        case "ATTACK_CANCELED": if (message.payload) handlers.onAttackCanceled(message.payload as AttackCanceledPayload); break;
        case "ERROR": handlers.onError(message.message ?? "Server từ chối yêu cầu."); break;
        default: break;
      }
    });
    socket.addEventListener("error", () => { /* close event drives reconnection */ });
    socket.addEventListener("close", (event) => {
      socket = undefined;
      if (stopped) return;
      if (event.code === 4401) { handlers.onAuthExpired(event.reason); return; }
      const delay = delays[Math.min(attempt, delays.length - 1)];
      attempt += 1;
      timer = setTimeout(connect, delay);
    });
  };
  connect();
  return {
    close: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (socket && socket.readyState === WebSocket.OPEN) socket.close(1000, "client close");
    },
  };
}

export async function startBuild(token: string, cityId: string, buildingId: keyof typeof gameRules.buildings): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/build", { cityId, buildingId, queueType: "build" });
}

export async function createRoute(token: string, sourceCityId: string, destinationKind: "city" | "market", destinationId: string): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/routes", { sourceCityId, destinationKind, destinationId });
}

export async function startCaravan(token: string, routeId: string, cargo: { food?: number; wood: number; stone: number; iron: number }): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/caravans", { routeId, cargo });
}
export async function harvest(token: string, nodeId: string, cityId: string, amount = 50): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/harvest", { nodeId, cityId, amount });
}
export async function escort(token: string, caravanId: string, armyId: string): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/escort", { caravanId, armyId });
}
export async function ambush(token: string, caravanId: string): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/ambush", { caravanId });
}

export async function recruit(token: string, cityId: string, unitType: string, amount: number): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/recruit", { cityId, unitType, amount });
}

export async function moveArmy(token: string, armyId: string, targetX: number, targetY: number): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/move-army", { armyId, targetX, targetY });
}

export async function attack(token: string, armyId: string, targetArmyId: string): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/attack", { armyId, targetArmyId });
}

export async function cancelArmyOrder(token: string, armyId: string): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/cancel-army-order", { armyId });
}

export async function setFormation(token: string, armyId: string, formation: string): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/formation", { armyId, formation });
}

export async function mergeArmies(token: string, sourceArmyId: string, targetArmyId: string): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/merge-army", { sourceArmyId, targetArmyId });
}

export async function ackOnboarding(token: string, step: "city_inspected" | "score_viewed"): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/onboarding/ack", { step });
}

export async function createAlliance(token: string, name: string, tag: string): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/alliance/create", { name, tag });
}

export async function joinAlliance(token: string, allianceId: string): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/alliance/join", { allianceId });
}

export async function leaveAlliance(token: string): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/alliance/leave", {});
}

export async function contributeAlliance(token: string, cityId: string, resources: { wood: number; stone: number; iron: number }): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/alliance/contribute", { cityId, resources });
}

export async function proposeTreaty(token: string, targetPlayerId: string, treatyType: string): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/treaty/propose", { targetPlayerId, treatyType, durationSeconds: 259200 });
}

export async function respondTreaty(token: string, treatyId: string, accept: boolean): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/treaty/respond", { treatyId, accept });
}

export async function breakTreaty(token: string, treatyId: string): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/treaty/break", { treatyId });
}

export async function launchSpy(token: string, targetPlayerId: string, missionType: "scout" | "sabotage" | "steal"): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/spy/launch", { targetPlayerId, missionType });
}

export async function activateCounterIntel(token: string): Promise<CommandResponse> {
  return postCommand(token, "/api/commands/spy/counter-intel", {});
}

export async function passwordLogin(username: string, password: string): Promise<Session> { const response = await fetch(`${apiBase}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ username, password }) }); if (!response.ok) throw new ApiError(((await response.json()) as { code?: string }).code ?? "INVALID_REQUEST"); return readSession(response); }
export async function register(username: string, password: string, factionId: FactionId): Promise<Session> { const response = await fetch(`${apiBase}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ username, password, factionId }) }); if (!response.ok) throw new ApiError(((await response.json()) as { code?: string }).code ?? "INVALID_REQUEST"); return readSession(response); }

export async function refresh(): Promise<Session> { const response = await fetch(`${apiBase}/api/auth/refresh`, { method: "POST", credentials: "include" }); if (!response.ok) throw new ApiError("SESSION_EXPIRED"); return readSession(response); }
export async function logout(): Promise<void> { currentAccessToken = undefined; await fetch(`${apiBase}/api/auth/logout`, { method: "POST", credentials: "include" }); }

async function postCommand(token: string, path: string, body: Record<string, unknown>): Promise<CommandResponse> {
  const response = await authorizedFetch(token, apiBase + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ commandId: crypto.randomUUID(), ...body }) });
  if (!response.ok) throw new ApiError(((await response.json().catch(() => ({}))) as { code?: string }).code ?? "INVALID_REQUEST");
  const payload = await response.json().catch(() => ({})) as CommandResponse;
  if (payload.snapshot) snapshotSink?.(payload.snapshot);
  return payload;
}
export function manageAllianceMember(token: string, targetPlayerId: string, action: "promote" | "demote" | "kick"): Promise<CommandResponse> { return postCommand(token, "/api/commands/alliance/member", { targetPlayerId, action }); }
export function setAllianceNotice(token: string, notice: string): Promise<CommandResponse> { return postCommand(token, "/api/commands/alliance/notice", { notice }); }
export function openAllianceVote(token: string, candidatePlayerId: string): Promise<CommandResponse> { return postCommand(token, "/api/commands/alliance/vote/open", { candidatePlayerId }); }
export function castAllianceVote(token: string, voteId: string, vote: boolean): Promise<CommandResponse> { return postCommand(token, "/api/commands/alliance/vote/cast", { voteId, vote }); }
export async function seasonHistory(token: string): Promise<SeasonArchive> { const response = await authorizedFetch(token, apiBase + "/api/season-history"); if (!response.ok) throw new ApiError(((await response.json()) as { code?: string }).code ?? "ARCHIVE_FAILED"); return response.json() as Promise<SeasonArchive>; }
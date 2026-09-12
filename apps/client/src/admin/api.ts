const configuredApiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const apiBase = import.meta.env.VITE_API_URL || (typeof window !== "undefined" && window.location.hostname === "127.0.0.1" ? "http://127.0.0.1:3000" : configuredApiBase);
let currentSession: AdminSession | undefined;
let sessionGeneration = 0;
let refreshInFlight: Promise<AdminSession> | undefined;
let authQueue: Promise<void> = Promise.resolve();
let unauthorizedHandler: (() => void) | undefined;
let sessionHandler: ((session: AdminSession | undefined) => void) | undefined;

async function withAuthCookieLock<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request("kingdoms-admin-auth", action);
  let release!: () => void;
  const previous = authQueue;
  authQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await action(); } finally { release(); }
}

export class AdminApiError extends Error { constructor(public readonly code: string, public readonly status: number) { super(code); } }
export type AdminSession = { token: string; accessExpiresAt: string; admin: { id: string; username: string } };
export type AdminDashboard = { serverTime: string; players: { total: number; active: number; banned: number; activeSessions: number }; season: { id: string; status: string; startsAt: string; endsAt: string }; auditActionsLast24Hours: number };
export type AdminPlayer = { id: string; displayName: string; factionId: string; status: "active" | "banned"; bannedAt: string | null; createdAt: string | null };
export type AdminPlayerDetail = AdminPlayer & { bannedReason: string | null };
export type AdminSeason = { id: string; status: string; startsAt: string; endsAt: string; finalizedAt: string | null };
export type AuditAction = { id: string; actionType: string; actor: { id: string; username: string | null } | null; targetType: string | null; targetId: string | null; reason: string; outcome: string; authMethod: string; requestId: string | null; createdAt: string };

type RequestOptions = RequestInit & { retry?: boolean };
async function decode<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { code?: string };
  if (!response.ok) throw new AdminApiError(body.code ?? "REQUEST_FAILED", response.status);
  return body as T;
}
function saveSession(session: AdminSession): AdminSession { currentSession = session; sessionGeneration += 1; sessionHandler?.(session); return session; }
function invalidateSession(notifyUnauthorized = true): void { currentSession = undefined; sessionGeneration += 1; sessionHandler?.(undefined); if (notifyUnauthorized) unauthorizedHandler?.(); }
export function onUnauthorized(handler: (() => void) | undefined): () => void { unauthorizedHandler = handler; return () => { if (unauthorizedHandler === handler) unauthorizedHandler = undefined; }; }
export function onSession(handler: ((session: AdminSession | undefined) => void) | undefined): () => void { sessionHandler = handler; return () => { if (sessionHandler === handler) sessionHandler = undefined; }; }
export async function login(username: string, password: string): Promise<AdminSession> {
  return withAuthCookieLock(async () => {
    const response = await fetch(`${apiBase}/api/admin/auth/login`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
    return saveSession(await decode<AdminSession>(response));
  });
}
export async function refresh(): Promise<AdminSession> {
  if (!refreshInFlight) {
    const promise = withAuthCookieLock(async () => {
      const response = await fetch(`${apiBase}/api/admin/auth/refresh`, { method: "POST", credentials: "include" });
      return saveSession(await decode<AdminSession>(response));
    }).catch(error => { invalidateSession(); throw error; }).finally(() => { if (refreshInFlight === promise) refreshInFlight = undefined; });
    refreshInFlight = promise;
  }
  return refreshInFlight;
}
export async function logout(): Promise<void> {
  const generation = sessionGeneration;
  await withAuthCookieLock(async () => {
    const response = await fetch(`${apiBase}/api/admin/auth/logout`, { method: "POST", credentials: "include" });
    await decode<{ ok: boolean }>(response);
    if (sessionGeneration === generation) invalidateSession(false);
  });
}
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const requestGeneration = sessionGeneration; const headers = new Headers(options.headers); if (currentSession) headers.set("authorization", `Bearer ${currentSession.token}`);
  const response = await fetch(`${apiBase}${path}`, { ...options, headers, credentials: "include" });
  if (response.status === 401 && options.retry !== false) {
    if (sessionGeneration === requestGeneration) await refresh();
    return request<T>(path, { ...options, retry: false });
  }
  if (sessionGeneration !== requestGeneration) throw new AdminApiError("STALE_SESSION", 409);
  if (response.status === 401) invalidateSession();
  return decode<T>(response);
}
export const dashboard = () => request<AdminDashboard>("/api/admin/dashboard");
export const players = (query: { search?: string; status?: string; cursor?: string } = {}) => request<{ items: AdminPlayer[]; nextCursor?: string }>(`/api/admin/players?${new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString()}`);
export const player = (id: string) => request<AdminPlayerDetail>(`/api/admin/players/${encodeURIComponent(id)}`);
export const seasons = () => request<{ items: AdminSeason[] }>("/api/admin/seasons");
export const audits = (cursor?: string) => request<{ items: AuditAction[]; nextCursor?: string }>(`/api/admin/audit-actions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
async function mutate(path: string, body: object): Promise<void> { await request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
export const moderate = (playerId: string, status: "active" | "banned", reason: string) => mutate(`/api/admin/player/${status === "banned" ? "ban" : "unban"}`, { playerId, reason });
export const closeSeason = (seasonId: string, reason: string) => mutate("/api/admin/season/close", { seasonId, reason });

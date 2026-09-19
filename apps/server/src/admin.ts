import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { type AdminPrincipal, AuthRepository, REFRESH_MS, dummyPasswordHash, normalizeUsername, verifyPassword } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { GameStore } from "./store.js";

const credentialsSchema = z.object({ username: z.string().max(64), password: z.string().max(128) }).strict();
const uuidSchema = z.string().uuid();
const playerQuerySchema = z.object({ search: z.string().trim().max(64).optional(), status: z.enum(["active", "banned"]).optional(), cursor: z.string().max(1024).optional(), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();
const auditQuerySchema = z.object({ actionType: z.string().trim().max(64).optional(), actorId: uuidSchema.optional(), targetId: uuidSchema.optional(), cursor: z.string().max(1024).optional(), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();
type RateResult = false | "RATE_LIMITED" | "DEPENDENCY_UNAVAILABLE";

function bearer(request: FastifyRequest): string | undefined { return request.headers.authorization?.replace(/^Bearer\s+/i, ""); }
function cookie(request: FastifyRequest, name: string): string | undefined { return (request.headers.cookie ?? "").match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1]; }
function encodeCursor(value: object): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decodeCursor<T extends object>(value: string | undefined, schema: z.ZodType<T>): T | undefined {
  if (!value) return undefined;
  try { return schema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); } catch { throw new Error("INVALID_CURSOR"); }
}
function legacyAuthorized(request: FastifyRequest, token: string): boolean {
  if (!token) return false;
  const left = Buffer.from(bearer(request) ?? ""); const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type AuditContext = { actorId?: string; authMethod: "admin_session" | "legacy_token"; requestId: string };
type AdminModuleOptions = {
  app: FastifyInstance;
  auth: AuthRepository;
  config: AppConfig;
  store: () => GameStore;
  rateLimited: (key: string, limit: number, windowMs: number) => Promise<RateResult>;
  moderate: (request: FastifyRequest, reply: FastifyReply, status: "active" | "banned", context: AuditContext, playerId: string, reason: string) => Promise<unknown>;
  closeSeason: (request: FastifyRequest, reply: FastifyReply, context: AuditContext, seasonId: string, reason: string) => Promise<unknown>;
};

export function registerAdminRoutes(options: AdminModuleOptions): void {
  const { app, auth, config, rateLimited } = options;
  const pool = (): Pool | undefined => options.store().databasePool;
  const unavailable = (reply: FastifyReply) => reply.code(404).send({ code: "ADMIN_DISABLED" });
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply): Promise<AdminPrincipal | undefined> => {
    const token = bearer(request);
    if (!token) { reply.code(401).send({ code: "UNAUTHORIZED" }); return undefined; }
    const principal = await auth.authenticateAccess(token);
    if (!principal) { reply.code(401).send({ code: "UNAUTHORIZED" }); return undefined; }
    if (principal.kind !== "admin") { reply.code(403).send({ code: "FORBIDDEN" }); return undefined; }
    return principal;
  };
  const limit = async (reply: FastifyReply, key: string, amount: number, windowMs: number): Promise<boolean> => {
    const result = await rateLimited(key, amount, windowMs);
    if (!result) return false;
    reply.code(result === "RATE_LIMITED" ? 429 : 503).send({ code: result }); return true;
  };

  app.post("/api/admin/auth/login", async (request, reply) => {
    if (config.authMode !== "password" || !pool()) return unavailable(reply);
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_REQUEST" });
    const username = normalizeUsername(parsed.data.username);
    if (await limit(reply, `admin-login-ip:${request.ip}`, 20, 900_000)) return;
    if (await limit(reply, `admin-login-account:${username}`, 5, 900_000)) return;
    const row = await auth.findUser(username);
    const valid = await verifyPassword(parsed.data.password, row?.password_hash ?? await dummyPasswordHash());
    if (!row || row.role !== "admin" || row.status !== "active" || !valid) return reply.code(401).send({ code: "INVALID_CREDENTIALS" });
    let session;
    try { session = await auth.createSession({ kind: "admin", id: row.id, username, status: "active" }, row.password_hash); }
    catch (error) { if (error instanceof Error && error.message === "STALE_CREDENTIALS") return reply.code(401).send({ code: "INVALID_CREDENTIALS" }); throw error; }
    reply.setCookie("admin_refresh_token", session.refreshToken, { httpOnly: true, sameSite: "strict", secure: config.cookieSecure, path: "/api/admin/auth", maxAge: Math.floor(REFRESH_MS / 1000) });
    return { token: session.accessToken, accessExpiresAt: session.accessExpiresAt, admin: { id: row.id, username } };
  });

  app.post("/api/admin/auth/refresh", async (request, reply) => {
    if (config.authMode !== "password" || !pool()) return unavailable(reply);
    const token = cookie(request, "admin_refresh_token");
    if (!token) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (await limit(reply, `admin-refresh:${request.ip}`, 30, 60_000)) return;
    const session = await auth.rotateRefresh(token, "admin");
    if (!session || session.user.kind !== "admin") { reply.clearCookie("admin_refresh_token", { path: "/api/admin/auth" }); return reply.code(401).send({ code: "UNAUTHORIZED" }); }
    reply.setCookie("admin_refresh_token", session.refreshToken, { httpOnly: true, sameSite: "strict", secure: config.cookieSecure, path: "/api/admin/auth", maxAge: Math.floor(REFRESH_MS / 1000) });
    return { token: session.accessToken, accessExpiresAt: session.accessExpiresAt, admin: { id: session.user.id, username: session.user.username } };
  });

  app.post("/api/admin/auth/logout", async (request, reply) => {
    const token = cookie(request, "admin_refresh_token");
    try { if (token) await auth.revokeRefresh(token, "admin"); }
    finally { reply.clearCookie("admin_refresh_token", { path: "/api/admin/auth" }); }
    return { ok: true };
  });

  app.get("/api/admin/dashboard", async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const database = pool(); if (!database) return unavailable(reply);
    const [players, sessions, audits] = await Promise.all([
      database.query<{ total: string; active: string; banned: string }>("SELECT count(*)::text total,count(*) FILTER (WHERE status='active')::text active,count(*) FILTER (WHERE status='banned')::text banned FROM players"),
      database.query<{ active: string }>("SELECT count(*)::text active FROM auth_sessions WHERE principal_type='player' AND revoked_at IS NULL AND expires_at>now()"),
      database.query<{ recent: string }>("SELECT count(*)::text recent FROM admin_actions WHERE created_at>now()-interval '24 hours'")
    ]);
    const counts = players.rows[0]!; const state = options.store().snapshot;
    return { serverTime: new Date().toISOString(), players: { total: Number(counts.total), active: Number(counts.active), banned: Number(counts.banned), activeSessions: Number(sessions.rows[0]?.active ?? 0) }, season: { id: state.season.id, status: state.season.status, startsAt: state.season.startsAt, endsAt: state.season.endsAt }, auditActionsLast24Hours: Number(audits.rows[0]?.recent ?? 0) };
  });

  app.get("/api/admin/players", async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const parsed = playerQuerySchema.safeParse(request.query); if (!parsed.success) return reply.code(400).send({ code: "INVALID_REQUEST" });
    let cursor: { displayName: string; id: string } | undefined;
    try { cursor = decodeCursor(parsed.data.cursor, z.object({ displayName: z.string(), id: uuidSchema })); } catch { return reply.code(400).send({ code: "INVALID_CURSOR" }); }
    const database = pool(); if (!database) return unavailable(reply);
    const values: unknown[] = []; const clauses: string[] = [];
    if (parsed.data.search) { values.push(`%${parsed.data.search}%`); clauses.push(`p.display_name ILIKE $${values.length}`); }
    if (parsed.data.status) { values.push(parsed.data.status); clauses.push(`p.status=$${values.length}`); }
    if (cursor) { values.push(cursor.displayName, cursor.id); clauses.push(`(lower(p.display_name),p.id) > (lower($${values.length - 1}),$${values.length}::uuid)`); }
    values.push(parsed.data.limit + 1); const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await database.query<{ id: string; display_name: string; faction_id: string; status: "active" | "banned"; banned_at: Date | null; created_at: Date | null }>(`SELECT p.id,p.display_name,p.faction_id,p.status,u.banned_at,u.created_at FROM players p LEFT JOIN users u ON u.id=p.user_id ${where} ORDER BY lower(p.display_name),p.id LIMIT $${values.length}`, values);
    const page = rows.rows.slice(0, parsed.data.limit); const last = page.at(-1);
    return { items: page.map(row => ({ id: row.id, displayName: row.display_name, factionId: row.faction_id, status: row.status, bannedAt: row.banned_at?.toISOString() ?? null, createdAt: row.created_at?.toISOString() ?? null })), nextCursor: rows.rows.length > parsed.data.limit && last ? encodeCursor({ displayName: last.display_name, id: last.id }) : undefined };
  });

  app.get<{ Params: { id: string } }>("/api/admin/players/:id", async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    if (!uuidSchema.safeParse(request.params.id).success) return reply.code(400).send({ code: "INVALID_REQUEST" });
    const database = pool(); if (!database) return unavailable(reply);
    const result = await database.query<{ id: string; display_name: string; faction_id: string; status: string; banned_at: Date | null; banned_reason: string | null; created_at: Date | null }>("SELECT p.id,p.display_name,p.faction_id,p.status,u.banned_at,u.banned_reason,u.created_at FROM players p LEFT JOIN users u ON u.id=p.user_id WHERE p.id=$1", [request.params.id]);
    const row = result.rows[0]; if (!row) return reply.code(404).send({ code: "PLAYER_NOT_FOUND" });
    return { id: row.id, displayName: row.display_name, factionId: row.faction_id, status: row.status, bannedAt: row.banned_at?.toISOString() ?? null, bannedReason: row.banned_reason, createdAt: row.created_at?.toISOString() ?? null };
  });

  app.get("/api/admin/seasons", async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const database = pool(); if (!database) return unavailable(reply);
    const result = await database.query<{ id: string; status: string; starts_at: Date; ends_at: Date; finalized_at: Date | null }>("SELECT id,status,starts_at,ends_at,finalized_at FROM seasons ORDER BY starts_at DESC,id DESC LIMIT 25");
    return { items: result.rows.map(row => ({ id: row.id, status: row.status, startsAt: row.starts_at.toISOString(), endsAt: row.ends_at.toISOString(), finalizedAt: row.finalized_at?.toISOString() ?? null })) };
  });

  app.get("/api/admin/audit-actions", async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const parsed = auditQuerySchema.safeParse(request.query); if (!parsed.success) return reply.code(400).send({ code: "INVALID_REQUEST" });
    let cursor: { createdAt: string; id: string } | undefined;
    try { cursor = decodeCursor(parsed.data.cursor, z.object({ createdAt: z.string().datetime(), id: uuidSchema })); } catch { return reply.code(400).send({ code: "INVALID_CURSOR" }); }
    const database = pool(); if (!database) return unavailable(reply); const values: unknown[] = []; const clauses: string[] = [];
    if (parsed.data.actionType) { values.push(parsed.data.actionType); clauses.push(`a.action_type=$${values.length}`); }
    if (parsed.data.actorId) { values.push(parsed.data.actorId); clauses.push(`a.actor_id=$${values.length}`); }
    if (parsed.data.targetId) { values.push(parsed.data.targetId); clauses.push(`a.target_id=$${values.length}`); }
    if (cursor) { values.push(cursor.createdAt, cursor.id); clauses.push(`(a.created_at,a.id)<($${values.length - 1}::timestamptz,$${values.length}::uuid)`); }
    values.push(parsed.data.limit + 1); const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await database.query<{ id: string; action_type: string; actor_id: string | null; username_normalized: string | null; target_type: string | null; target_id: string | null; reason: string; outcome: string; auth_method: string; request_id: string | null; metadata: unknown; created_at: Date }>(`SELECT a.id,a.action_type,a.actor_id,u.username_normalized,a.target_type,a.target_id,a.reason,a.outcome,a.auth_method,a.request_id,a.metadata,a.created_at FROM admin_actions a LEFT JOIN users u ON u.id=a.actor_id ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT $${values.length}`, values);
    const page = result.rows.slice(0, parsed.data.limit); const last = page.at(-1);
    return { items: page.map(row => ({ id: row.id, actionType: row.action_type, actor: row.actor_id ? { id: row.actor_id, username: row.username_normalized } : null, targetType: row.target_type, targetId: row.target_id, reason: row.reason, outcome: row.outcome, authMethod: row.auth_method, requestId: row.request_id, metadata: row.metadata, createdAt: row.created_at.toISOString() })), nextCursor: result.rows.length > parsed.data.limit && last ? encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id }) : undefined };
  });

  const mutationContext = async (request: FastifyRequest, reply: FastifyReply): Promise<AuditContext | undefined> => {
    if (!config.adminToken && (config.authMode !== "password" || !pool())) { unavailable(reply); return undefined; }
    const token = bearer(request); if (!token) { reply.code(401).send({ code: "UNAUTHORIZED" }); return undefined; }
    if (legacyAuthorized(request, config.adminToken)) return { authMethod: "legacy_token", requestId: request.id };
    const principal = await auth.authenticateAccess(token);
    if (principal?.kind === "admin") return { actorId: principal.id, authMethod: "admin_session", requestId: request.id };
    if (principal?.kind === "player") { reply.code(403).send({ code: "FORBIDDEN" }); return undefined; }
    reply.code(401).send({ code: "UNAUTHORIZED" }); return undefined;
  };
  const moderateSchema = z.object({ playerId: uuidSchema, reason: z.string().trim().min(3).max(500) }).strict();
  const closeSchema = z.object({ seasonId: uuidSchema, reason: z.string().trim().min(3).max(500) }).strict();
  for (const [path, status] of [["/api/admin/player/ban", "banned"], ["/api/admin/player/unban", "active"]] as const) app.post(path, async (request, reply) => {
    const context = await mutationContext(request, reply); if (!context) return;
    if (await limit(reply, `admin-moderate:${request.ip}`, 10, 60_000)) return;
    const body = moderateSchema.safeParse(request.body); if (!body.success) return reply.code(400).send({ code: "INVALID_REQUEST" });
    return options.moderate(request, reply, status, context, body.data.playerId, body.data.reason);
  });
  app.post("/api/admin/season/close", async (request, reply) => {
    const context = await mutationContext(request, reply); if (!context) return;
    if (await limit(reply, `admin-season-close:${request.ip}`, 5, 60_000)) return;
    const body = closeSchema.safeParse(request.body); if (!body.success) return reply.code(400).send({ code: "INVALID_REQUEST" });
    return options.closeSeason(request, reply, context, body.data.seasonId, body.data.reason);
  });
}

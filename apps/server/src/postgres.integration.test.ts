import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { bootstrapAdmin } from "./admin-bootstrap.js";
import { hashPassword } from "./auth.js";

const testDatabaseUrl = process.env.RUN_POSTGRES_INTEGRATION === "1" ? process.env.TEST_DATABASE_URL : undefined;

function cookieValue(response: { headers: Record<string, string | number | string[] | undefined> }, name: string): string {
  const value = response.headers["set-cookie"];
  const serialized = Array.isArray(value) ? value.join(";") : String(value ?? "");
  const match = serialized.match(new RegExp(`${name}=([^;]+)`));
  assert.ok(match, `${name} cookie missing`);
  return match[1]!;
}

test("PostgreSQL admin sessions, bounded reads and attributable moderation survive restart", { skip: !testDatabaseUrl }, async () => {
  process.env.DATABASE_URL = testDatabaseUrl; process.env.AUTH_MODE = "password"; process.env.ADMIN_TOKEN = "postgres-integration-admin"; process.env.CLIENT_ORIGIN = "http://localhost:5173";
  const pool = new Pool({ connectionString: testDatabaseUrl, max: 2 });
  let first: ReturnType<(typeof import("./app.js"))["createServer"]> | undefined;
  let second: ReturnType<(typeof import("./app.js"))["createServer"]> | undefined;
  try {
    const adminUsername = `admin_${randomUUID().replaceAll("-", "").slice(0, 16)}`; const adminPassword = "AdminIntegrationPass123!";
  assert.equal(await bootstrapAdmin(pool, adminUsername, await hashPassword(adminPassword, 1024), false), "created");
  assert.equal(await bootstrapAdmin(pool, adminUsername, undefined, false), "unchanged");
  const adminRow = await pool.query<{ id: string; player_count: number }>("SELECT u.id,(SELECT count(*)::int FROM players p WHERE p.user_id=u.id) AS player_count FROM users u WHERE u.username_normalized=$1 AND u.role='admin'", [adminUsername]);
  assert.equal(adminRow.rows[0]?.player_count, 0, "admin identity has no synthetic player row");
  const bootstrapAudit = await pool.query<{ actor_id: string | null; target_id: string; auth_method: string }>("SELECT actor_id,target_id,auth_method FROM admin_actions WHERE action_type='admin.create' AND target_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [adminRow.rows[0]?.id]);
  assert.equal(bootstrapAudit.rows[0]?.actor_id, null); assert.equal(bootstrapAudit.rows[0]?.target_id, adminRow.rows[0]?.id); assert.equal(bootstrapAudit.rows[0]?.auth_method, "bootstrap");
  const playerUsername = `target_${randomUUID().replaceAll("-", "").slice(0, 16)}`; const playerPassword = "PlayerIntegrationPass123!";
  const { createServer } = await import("./app.js"); first = createServer(); await first.store.load();
  const register = await first.app.inject({ method: "POST", url: "/api/auth/register", headers: { origin: "http://localhost:5173" }, payload: { username: playerUsername, password: playerPassword, displayName: "Admin Target", factionId: "meridian" } });
  assert.equal(register.statusCode, 200, register.body); const playerSession = register.json() as { token: string; player: { id: string } };
  const login = await first.app.inject({ method: "POST", url: "/api/admin/auth/login", headers: { origin: "http://localhost:5173" }, payload: { username: adminUsername, password: adminPassword } });
  assert.equal(login.statusCode, 200, login.body); const adminSession = login.json() as { token: string; admin: { id: string } }; const refreshToken = cookieValue(login, "admin_refresh_token");
  assert.match(String(login.headers["set-cookie"]), /HttpOnly/i); assert.match(String(login.headers["set-cookie"]), /SameSite=Strict/i); assert.match(String(login.headers["set-cookie"]), /Path=\/api\/admin\/auth/i);
  const adminHeaders = { authorization: `Bearer ${adminSession.token}` };
  assert.equal((await first.app.inject({ method: "GET", url: "/api/bootstrap", headers: adminHeaders })).statusCode, 401);
  assert.equal((await first.app.inject({ method: "GET", url: "/api/admin/dashboard", headers: { authorization: `Bearer ${playerSession.token}` } })).statusCode, 403);
  const playerRefreshToken = register.cookies.find(item => item.name === "refresh_token")?.value;
  assert.ok(playerRefreshToken, "player refresh cookie missing");
  assert.equal((await first.app.inject({ method: "POST", url: "/api/admin/auth/refresh", headers: { origin: "http://localhost:5173", cookie: `admin_refresh_token=${playerRefreshToken}` } })).statusCode, 401);
  const rightfulPlayerRefresh = await first.app.inject({ method: "POST", url: "/api/auth/refresh", headers: { origin: "http://localhost:5173", cookie: `refresh_token=${playerRefreshToken}` } });
  assert.equal(rightfulPlayerRefresh.statusCode, 200, rightfulPlayerRefresh.body);
  const dashboard = await first.app.inject({ method: "GET", url: "/api/admin/dashboard", headers: adminHeaders }); assert.equal(dashboard.statusCode, 200, dashboard.body); assert.equal("armies" in dashboard.json(), false);
  const players = await first.app.inject({ method: "GET", url: "/api/admin/players?search=Admin%20Target&limit=1", headers: adminHeaders }); assert.equal(players.statusCode, 200, players.body); const playerPage = players.json() as { items: Array<{ id: string }>; nextCursor?: string }; assert.equal(playerPage.items[0]?.id, playerSession.player.id);
  const playerDetail = await first.app.inject({ method: "GET", url: `/api/admin/players/${playerSession.player.id}`, headers: adminHeaders }); assert.equal(playerDetail.statusCode, 200, playerDetail.body); assert.equal(playerDetail.json().displayName, "Admin Target");
  const seasons = await first.app.inject({ method: "GET", url: "/api/admin/seasons", headers: adminHeaders }); assert.equal(seasons.statusCode, 200, seasons.body); assert.ok(seasons.json().items.length > 0);
  const badPlayerCursor = Buffer.from(JSON.stringify({ displayName: "Admin Target", id: "not-a-uuid" })).toString("base64url"); assert.equal((await first.app.inject({ method: "GET", url: `/api/admin/players?cursor=${badPlayerCursor}`, headers: adminHeaders })).statusCode, 400);
  const ban = await first.app.inject({ method: "POST", url: "/api/admin/player/ban", headers: adminHeaders, payload: { playerId: playerSession.player.id, reason: "admin integration moderation" } }); assert.equal(ban.statusCode, 200, ban.body);
  const audits = await first.app.inject({ method: "GET", url: `/api/admin/audit-actions?actorId=${adminSession.admin.id}&targetId=${playerSession.player.id}&limit=1`, headers: adminHeaders }); assert.equal(audits.statusCode, 200, audits.body); const auditPage = audits.json() as { items: Array<{ actor: { id: string }; authMethod: string; outcome: string; requestId: string }>; nextCursor?: string }; const action = auditPage.items[0]!; assert.equal(action.actor.id, adminSession.admin.id); assert.equal(action.authMethod, "admin_session"); assert.equal(action.outcome, "applied"); assert.ok(action.requestId);
  const badAuditCursor = Buffer.from(JSON.stringify({ createdAt: "2026-02-30", id: randomUUID() })).toString("base64url"); assert.equal((await first.app.inject({ method: "GET", url: `/api/admin/audit-actions?cursor=${badAuditCursor}`, headers: adminHeaders })).statusCode, 400);
  const legacyHeaders = { authorization: "Bearer postgres-integration-admin" };
  assert.equal((await first.app.inject({ method: "GET", url: "/api/admin/dashboard", headers: legacyHeaders })).statusCode, 401);
  const legacyUnban = await first.app.inject({ method: "POST", url: "/api/admin/player/unban", headers: legacyHeaders, payload: { playerId: playerSession.player.id, reason: "legacy integration cleanup" } }); assert.equal(legacyUnban.statusCode, 200, legacyUnban.body);
  const legacyAudit = await pool.query<{ actor_id: string | null; auth_method: string }>("SELECT actor_id,auth_method FROM admin_actions WHERE target_id=$1 AND action_type='player.unban' ORDER BY created_at DESC,id DESC LIMIT 1", [playerSession.player.id]); assert.equal(legacyAudit.rows[0]?.actor_id, null); assert.equal(legacyAudit.rows[0]?.auth_method, "legacy_token");
  const refreshed = await first.app.inject({ method: "POST", url: "/api/admin/auth/refresh", headers: { origin: "http://localhost:5173", cookie: `admin_refresh_token=${refreshToken}` } }); assert.equal(refreshed.statusCode, 200, refreshed.body); const rotatedRefresh = cookieValue(refreshed, "admin_refresh_token"); assert.notEqual(rotatedRefresh, refreshToken);
  const replay = await first.app.inject({ method: "POST", url: "/api/admin/auth/refresh", headers: { origin: "http://localhost:5173", cookie: `admin_refresh_token=${refreshToken}` } }); assert.equal(replay.statusCode, 401, replay.body);
  const revokedFamily = await first.app.inject({ method: "POST", url: "/api/admin/auth/refresh", headers: { origin: "http://localhost:5173", cookie: `admin_refresh_token=${rotatedRefresh}` } }); assert.equal(revokedFamily.statusCode, 401, revokedFamily.body);
  const relogin = await first.app.inject({ method: "POST", url: "/api/admin/auth/login", headers: { origin: "http://localhost:5173" }, payload: { username: adminUsername, password: adminPassword } }); assert.equal(relogin.statusCode, 200, relogin.body); const logoutRefresh = cookieValue(relogin, "admin_refresh_token");
  const logout = await first.app.inject({ method: "POST", url: "/api/admin/auth/logout", headers: { origin: "http://localhost:5173", cookie: `admin_refresh_token=${logoutRefresh}` } }); assert.equal(logout.statusCode, 200, logout.body); assert.match(String(logout.headers["set-cookie"]), /Max-Age=0/);
  assert.equal((await first.app.inject({ method: "POST", url: "/api/admin/auth/refresh", headers: { origin: "http://localhost:5173", cookie: `admin_refresh_token=${logoutRefresh}` } })).statusCode, 401);
  await first.app.close(); first = undefined; second = createServer(); await second.store.load(); const loginAfterRestart = await second.app.inject({ method: "POST", url: "/api/admin/auth/login", headers: { origin: "http://localhost:5173" }, payload: { username: adminUsername, password: adminPassword } }); assert.equal(loginAfterRestart.statusCode, 200, loginAfterRestart.body);
  } finally {
    await first?.app.close().catch(() => undefined);
    await second?.app.close().catch(() => undefined);
    await pool.end();
  }
});

test("PostgreSQL auth, command idempotency and moderation survive restart", { skip: !testDatabaseUrl }, async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.AUTH_MODE = "password";
  process.env.ADMIN_TOKEN = "postgres-integration-admin";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  const { createServer } = await import("./app.js");
  const username = `integration_${randomUUID().replaceAll("-", "").slice(0, 16)}`; const password = "IntegrationPass123!"; const commandId = `build-${randomUUID()}`;
  const first = createServer(); await first.store.load();
  const register = await first.app.inject({ method: "POST", url: "/api/auth/register", headers: { origin: "http://localhost:5173" }, payload: { username, password, displayName: "Postgres Integration", factionId: "meridian" } });
  assert.equal(register.statusCode, 200, register.body); const session = register.json() as { token: string; player: { id: string }; snapshot: { cities: Array<{ id: string; playerId: string }> } }; const cityId = session.snapshot.cities.find(city => city.playerId === session.player.id)!.id;
  const built = await first.app.inject({ method: "POST", url: "/api/commands/build", headers: { authorization: `Bearer ${session.token}` }, payload: { commandId, cityId, buildingId: "warehouse", queueType: "build" } }); assert.equal(built.statusCode, 200, built.body);
  await first.app.close();

  const second = createServer(); await second.store.load(); const login = await second.app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "http://localhost:5173" }, payload: { username, password } }); assert.equal(login.statusCode, 200, login.body); const nextSession = login.json() as { token: string };
  const duplicate = await second.app.inject({ method: "POST", url: "/api/commands/build", headers: { authorization: `Bearer ${nextSession.token}` }, payload: { commandId, cityId, buildingId: "warehouse", queueType: "build" } }); assert.equal(duplicate.statusCode, 200, duplicate.body); assert.equal(duplicate.json().result, "already_processed");
  const ban = await second.app.inject({ method: "POST", url: "/api/admin/player/ban", headers: { authorization: "Bearer postgres-integration-admin" }, payload: { playerId: session.player.id, reason: "integration ban" } }); assert.equal(ban.statusCode, 200, ban.body);
  const revoked = await second.app.inject({ method: "GET", url: "/api/bootstrap", headers: { authorization: `Bearer ${nextSession.token}` } }); assert.equal(revoked.statusCode, 401);
  const unban = await second.app.inject({ method: "POST", url: "/api/admin/player/unban", headers: { authorization: "Bearer postgres-integration-admin" }, payload: { playerId: session.player.id, reason: "integration unban" } }); assert.equal(unban.statusCode, 200, unban.body); await second.app.close();

  const pool = new Pool({ connectionString: testDatabaseUrl }); const audit = await pool.query("SELECT (SELECT count(*) FROM event_ledger WHERE command_id=$1)::int AS ledger_count,(SELECT count(*) FROM outbox_events o JOIN event_ledger e ON e.id=o.id WHERE e.command_id=$1)::int AS outbox_count", [commandId]); assert.equal(audit.rows[0].ledger_count, 1); assert.equal(audit.rows[0].outbox_count, 1); await pool.end();
});

test("two server instances serialize the same command id", { skip: !testDatabaseUrl }, async () => {
  process.env.DATABASE_URL = testDatabaseUrl; process.env.AUTH_MODE = "password"; process.env.CLIENT_ORIGIN = "http://localhost:5173";
  const { createServer } = await import("./app.js"); const username = `multi_${randomUUID().replaceAll("-", "").slice(0, 20)}`; const password = "MultiInstancePass123!"; const commandId = `multi-${randomUUID()}`;
  const first = createServer(); const second = createServer(); await Promise.all([first.store.load(), second.store.load()]);
  const register = await first.app.inject({ method: "POST", url: "/api/auth/register", headers: { origin: "http://localhost:5173" }, payload: { username, password, displayName: "Multi Instance", factionId: "bastion" } }); assert.equal(register.statusCode, 200, register.body); const registered = register.json() as { token: string; player: { id: string }; snapshot: { cities: Array<{ id: string; playerId: string }> } }; await second.store.load();
  const login = await second.app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "http://localhost:5173" }, payload: { username, password } }); assert.equal(login.statusCode, 200, login.body); const secondToken = (login.json() as { token: string }).token; const cityId = registered.snapshot.cities.find(city => city.playerId === registered.player.id)!.id; const payload = { commandId, cityId, buildingId: "warehouse", queueType: "build" };
  const [left, right] = await Promise.all([first.app.inject({ method: "POST", url: "/api/commands/build", headers: { authorization: `Bearer ${registered.token}` }, payload }), second.app.inject({ method: "POST", url: "/api/commands/build", headers: { authorization: `Bearer ${secondToken}` }, payload })]); assert.equal(left.statusCode, 200, left.body); assert.equal(right.statusCode, 200, right.body); assert.equal([left.json().result, right.json().result].filter(result => result === "already_processed").length, 1);
  await Promise.all([first.app.close(), second.app.close()]); const pool = new Pool({ connectionString: testDatabaseUrl }); const result = await pool.query("SELECT count(*)::int AS count FROM event_ledger WHERE command_id=$1", [commandId]); assert.equal(result.rows[0].count, 1); await pool.end();
});

test("two server instances validate forced close against authoritative season", { skip: !testDatabaseUrl }, async () => {
  process.env.DATABASE_URL = testDatabaseUrl; process.env.AUTH_MODE = "password"; process.env.ADMIN_TOKEN = "postgres-season-admin"; process.env.CLIENT_ORIGIN = "http://localhost:5173";
  const { createServer } = await import("./app.js"); const first = createServer(); const second = createServer();
  try {
    await Promise.all([first.store.load(), second.store.load()]);
    const oldSeasonId = second.store.snapshot.season.id;
    const closed = await first.store.runExclusive(() => first.store.finalizeIfDue({ force: true, expectedSeasonId: oldSeasonId, reason: "first instance close", authMethod: "legacy_token", requestId: randomUUID() }));
    assert.equal(closed, true);
    const currentSeasonId = first.store.snapshot.season.id; assert.notEqual(currentSeasonId, oldSeasonId);
    const accepted = await second.store.runExclusive(() => second.store.finalizeIfDue({ force: true, expectedSeasonId: currentSeasonId, reason: "stale node valid close", authMethod: "legacy_token", requestId: randomUUID() }));
    assert.equal(accepted, true, "stale node accepts the current database season id");
  } finally { await Promise.all([first.app.close(), second.app.close()]); }
});

test("onboarding progress survives restart via player_onboarding", { skip: !testDatabaseUrl }, async () => {
  process.env.DATABASE_URL = testDatabaseUrl; process.env.AUTH_MODE = "password"; process.env.CLIENT_ORIGIN = "http://localhost:5173";
  const { createServer } = await import("./app.js");
  const username = `onboard_${randomUUID().replaceAll("-", "").slice(0, 16)}`; const password = "OnboardingPass123!";
  const first = createServer(); await first.store.load();
  const register = await first.app.inject({ method: "POST", url: "/api/auth/register", headers: { origin: "http://localhost:5173" }, payload: { username, password, displayName: "Onboarding Test", factionId: "meridian" } });
  assert.equal(register.statusCode, 200, register.body); const session = register.json() as { token: string; player: { id: string } };
  const ack = await first.app.inject({ method: "POST", url: "/api/commands/onboarding/ack", headers: { authorization: `Bearer ${session.token}` }, payload: { commandId: "ack-" + randomUUID().slice(0, 8), step: "city_inspected" } });
  assert.equal(ack.statusCode, 200, ack.body);
  await first.app.close();

  const second = createServer(); await second.store.load();
  const login = await second.app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "http://localhost:5173" }, payload: { username, password } }); assert.equal(login.statusCode, 200, login.body); const token = (login.json() as { token: string }).token;
  const bootstrap = await second.app.inject({ method: "GET", url: "/api/bootstrap", headers: { authorization: `Bearer ${token}` } }); assert.equal(bootstrap.statusCode, 200, bootstrap.body);
  const onboarding = (bootstrap.json() as { snapshot: { onboarding: { variant: string; completedSteps: string[] } } }).snapshot.onboarding;
  assert.equal(onboarding.variant, "web_alpha_v1");
  assert.ok(onboarding.completedSteps.includes("city_inspected"), "acked step survives restart without duplication");
  assert.equal(onboarding.completedSteps.filter(step => step === "city_inspected").length, 1);
  await second.app.close();
});

test("a failed persist rolls back combat/onboarding claims; retry with the same commandId applies", { skip: !testDatabaseUrl }, async () => {
  process.env.DATABASE_URL = testDatabaseUrl; process.env.AUTH_MODE = "password"; process.env.CLIENT_ORIGIN = "http://localhost:5173";
  const { createServer } = await import("./app.js");
  const username = `failpersist_${randomUUID().replaceAll("-", "").slice(0, 16)}`; const password = "FailPersistPass123!";
  const server = createServer(); await server.store.load();
  const register = await server.app.inject({ method: "POST", url: "/api/auth/register", headers: { origin: "http://localhost:5173" }, payload: { username, password, displayName: "Fail Persist", factionId: "meridian" } });
  assert.equal(register.statusCode, 200, register.body);
  const session = register.json() as { token: string; player: { id: string }; snapshot: { cities: Array<{ id: string; playerId: string }> } };
  const city = server.store.snapshot.cities.find(item => item.playerId === session.player.id)!;
  city.buildings.barracks = 1;
  city.resources = { wood: 500, stone: 500, iron: 500, food: 0 };
  await server.store.save(); // persist the barracks/seeds into PostgreSQL
  const commandId = `retry-${randomUUID()}`;
  const headers = { authorization: `Bearer ${session.token}` };
  const recruit = (id: string) => server.app.inject({ method: "POST", url: "/api/commands/recruit", headers, payload: { commandId: id, cityId: city.id, unitType: "infantry", amount: 10 } });

  // Simulate the DB rejecting the persist after the action already claimed the command.
  const originalPersist = (server.store as any).persistState;
  (server.store as any).persistState = async () => { throw new Error("simulated persist failure"); };
  let failed: Awaited<ReturnType<typeof recruit>>;
  try {
    failed = await recruit(commandId);
  } finally {
    (server.store as any).persistState = originalPersist;
  }
  assert.equal(failed.statusCode, 500, failed.body);
  assert.equal((failed.json() as { result: string }).result, "rejected");
  assert.equal(server.store.snapshot.armies.filter(army => army.ownerPlayerId === session.player.id).length, 0, "failed attempt left no army behind");

  // The claim was released and the DB rolled back: the same commandId applies now.
  const retried = await recruit(commandId);
  assert.equal(retried.statusCode, 200, retried.body);
  assert.equal(retried.json().result, "accepted");
  assert.equal(server.store.snapshot.armies.filter(army => army.ownerPlayerId === session.player.id).length, 1, "retry applied the recruit");
  assert.equal(server.store.snapshot.cities.find(item => item.id === city.id)!.resources.wood, 450, "cost deducted exactly once");
  await server.app.close();
});

test("GET /api/battles uses the player indexes, pages via cursor and survives restart", { skip: !testDatabaseUrl }, async () => {
  process.env.DATABASE_URL = testDatabaseUrl; process.env.AUTH_MODE = "password"; process.env.CLIENT_ORIGIN = "http://localhost:5173";
  const { createServer } = await import("./app.js");
  const register = async (name: string, factionId: string) => {
    const server = createServer(); await server.store.load();
    const response = await server.app.inject({ method: "POST", url: "/api/auth/register", headers: { origin: "http://localhost:5173" }, payload: { username: name, password: "BattlePass123!", displayName: name, factionId } });
    assert.equal(response.statusCode, 200, response.body);
    const session = response.json() as { token: string; player: { id: string } };
    await server.app.close();
    return { ...session, username: name };
  };
  const a = await register(`battle_a_${randomUUID().replaceAll("-", "").slice(0, 12)}`, "meridian");
  const b = await register(`battle_b_${randomUUID().replaceAll("-", "").slice(0, 12)}`, "bastion");
  const c = await register(`battle_c_${randomUUID().replaceAll("-", "").slice(0, 12)}`, "veiled");

  const pool = new Pool({ connectionString: testDatabaseUrl });
  const kingdom = await pool.query("SELECT kingdom_id FROM players WHERE id = $1", [a.player.id]);
  const kingdomId = kingdom.rows[0].kingdom_id as string;
  const seasonId = (await pool.query("SELECT id FROM seasons ORDER BY starts_at DESC LIMIT 1")).rows[0].id as string;
  const bId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const participant = (playerId: string | null, armyId: string) => JSON.stringify({ ownerType: "player", playerId, armyId, unitType: "infantry", formation: "line", strengthBefore: 100, strengthAfter: 50, moraleBefore: 70, moraleAfter: 60, supplyBefore: 100 });
  const insert = (n: number, attackerId: string | null, defenderId: string | null, createdAt: string) => {
    const id = bId(n);
    return pool.query(
      `INSERT INTO battle_reports (id, kingdom_id, season_id, attacker_id, defender_id, attacker_army_id, defender_army_id, tile_x, tile_y, terrain, victor, seed, rounds, result, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 3, 4, 'plains', 'attacker', 7, '[]', $8, $9) ON CONFLICT (id) DO NOTHING`,
      [id, kingdomId, seasonId, attackerId, defenderId, bId(1000 + n), bId(2000 + n),
        JSON.stringify({ id, kingdomId, seasonId, tileX: 3, tileY: 4, terrain: "plains", victor: "attacker", seed: 7, rounds: [], resolvedAt: createdAt, attacker: JSON.parse(participant(attackerId, bId(1000 + n))), defender: JSON.parse(participant(defenderId, bId(2000 + n))) }),
        createdAt]);
  };
  await insert(1, a.player.id, b.player.id, "2026-08-01T01:00:00.000Z");
  await insert(2, a.player.id, b.player.id, "2026-08-02T01:00:00.000Z");
  await insert(3, a.player.id, b.player.id, "2026-08-03T01:00:00.000Z");
  await insert(4, b.player.id, c.player.id, "2026-08-04T01:00:00.000Z");
  await insert(5, c.player.id, a.player.id, "2026-08-05T01:00:00.000Z");

  // Index usage: the OR-filter resolves through both partial indexes. A tiny table
  // makes the planner prefer a Seq Scan, so force index paths off to prove the
  // indexes are usable, not just present.
  const explainClient = await pool.connect();
  await explainClient.query("SET enable_seqscan = off");
  const explain = await explainClient.query("EXPLAIN SELECT id, created_at, result FROM battle_reports WHERE (attacker_id = $1 OR defender_id = $1) ORDER BY created_at DESC, id DESC LIMIT 21", [a.player.id]);
  await explainClient.release();
  const plan = (explain.rows as Array<{ "QUERY PLAN": string }>).map(row => row["QUERY PLAN"]).join("\n");
  assert.ok(plan.includes("idx_battle_reports_attacker_id"), plan);
  assert.ok(plan.includes("idx_battle_reports_defender_id"), plan);

  const injectGet = (instance: Awaited<ReturnType<typeof import("./app.js")["createServer"]>>, token: string, query = "") => instance.app.inject({ method: "GET", url: `/api/battles${query}`, headers: { authorization: `Bearer ${token}` } });
  const server = createServer(); await server.store.load();
  const login = await server.app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "http://localhost:5173" }, payload: { username: a.username, password: "BattlePass123!" } });
  assert.equal(login.statusCode, 200, login.body);
  const token = (login.json() as { token: string }).token;
  const first = await injectGet(server, token, "?limit=2");
  assert.equal(first.statusCode, 200, first.body);
  const impossibleDate = Buffer.from(JSON.stringify({ createdAt: "2020-02-30", id: bId(99) })).toString("base64url");
  const invalidCursor = await injectGet(server, token, `?cursor=${encodeURIComponent(impossibleDate)}`);
  assert.equal(invalidCursor.statusCode, 400, invalidCursor.body);
  assert.equal((invalidCursor.json() as { code: string }).code, "INVALID_CURSOR");
  const page1 = first.json() as { items: Array<{ id: string }>; nextCursor: string };
  assert.deepEqual(page1.items.map(item => item.id), [bId(5), bId(3)], "newest-first, A sees battles where A fights");
  const page2 = (await injectGet(server, token, `?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`)).json() as { items: Array<{ id: string }>; nextCursor?: string };
  assert.deepEqual(page2.items.map(item => item.id), [bId(2), bId(1)]);
  assert.equal(page2.nextCursor, undefined, "last page carries no cursor");
  const loginB = await server.app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "http://localhost:5173" }, payload: { username: b.username, password: "BattlePass123!" } });
  const tokenB = (loginB.json() as { token: string }).token;
  const pageB = (await injectGet(server, tokenB)).json() as { items: Array<{ id: string }> };
  assert.deepEqual(pageB.items.map(item => item.id), [bId(4), bId(3), bId(2), bId(1)], "B sees B-vs-C and B-vs-A");
  await server.app.close();

  // Restart: the same pages come back from the database alone.
  const restarted = createServer(); await restarted.store.load();
  const loginAgain = await restarted.app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "http://localhost:5173" }, payload: { username: a.username, password: "BattlePass123!" } });
  const tokenAgain = (loginAgain.json() as { token: string }).token;
  const afterRestart = (await injectGet(restarted, tokenAgain, "?limit=2")).json() as { items: Array<{ id: string }>; nextCursor: string };
  assert.deepEqual(afterRestart.items.map(item => item.id), [bId(5), bId(3)]);
  assert.equal(afterRestart.nextCursor, page1.nextCursor, "cursor keys are stable across restarts");
  await restarted.app.close();

  await pool.query("DELETE FROM battle_reports WHERE id::text LIKE '00000000-0000-4000-8000-%'");
  await pool.end();
});

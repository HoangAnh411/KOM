import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

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
  assert.equal(failed.statusCode, 400, failed.body);
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

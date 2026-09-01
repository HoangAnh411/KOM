import test from "node:test";
import assert from "node:assert/strict";
import type { BattleReport } from "@kingdoms/shared";
import { createServer } from "./app.js";
import { config } from "./config.js";

test("REST auth, bootstrap, validation and build command flow", async () => {
  const server = createServer();
  const login = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "Integration Player", factionId: "meridian" } });
  assert.equal(login.statusCode, 200);
  const session = login.json() as { token: string; player: { id: string }; snapshot: { cities: Array<{ id: string; playerId: string }> } };
  const cityId = session.snapshot.cities.find(city => city.playerId === session.player.id)!.id;
  assert.equal((await server.app.inject({ method: "GET", url: "/api/bootstrap" })).statusCode, 401);
  const bootstrap = await server.app.inject({ method: "GET", url: "/api/bootstrap", headers: { authorization: `Bearer ${session.token}` } });
  assert.equal(bootstrap.statusCode, 200);
  const build = await server.app.inject({ method: "POST", url: "/api/commands/build", headers: { authorization: `Bearer ${session.token}` }, payload: { commandId: "integration-build-1", cityId, buildingId: "warehouse", queueType: "build" } });
  assert.equal(build.statusCode, 200);
  const invalid = await server.app.inject({ method: "POST", url: "/api/commands/build", headers: { authorization: `Bearer ${session.token}` }, payload: { commandId: "integration-build-2", cityId, buildingId: "invalid" } });
  assert.equal(invalid.statusCode, 400);
  await server.app.close();
});

test("accepted commands are recorded in the event ledger", async () => {
  const server = createServer();
  const response = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "Ledger Player", factionId: "meridian" } });
  assert.equal(response.statusCode, 200);
  const events = server.store.ledger.all();
  assert.ok(events.some(event => event.eventType === "auth.accepted"));
  await server.app.close();
});

test("command responses conform to the shared CommandResponse contract", async () => {
  const server = createServer();
  const login = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "Contract Player", factionId: "meridian" } });
  const session = login.json() as { token: string; player: { id: string }; snapshot: { cities: Array<{ id: string; playerId: string }> } };
  const cityId = session.snapshot.cities.find(city => city.playerId === session.player.id)!.id;
  const headers = { authorization: `Bearer ${session.token}` };
  const build = (commandId: string) => server.app.inject({ method: "POST", url: "/api/commands/build", headers, payload: { commandId, cityId, buildingId: "warehouse", queueType: "build" } });
  const sent = await build("contract-build-1");
  assert.equal(sent.statusCode, 200);
  const body = sent.json() as { commandId: string; result: string; acceptedAt?: string; data?: unknown; snapshot?: unknown };
  assert.equal(body.commandId, "contract-build-1", "commandId echoed");
  assert.equal(body.result, "accepted");
  assert.equal(body.data, "accepted");
  assert.ok(body.acceptedAt);
  assert.ok(body.snapshot);
  const replay = await build("contract-build-1");
  assert.equal(replay.statusCode, 200);
  assert.equal((replay.json() as { result: string }).result, "already_processed");
  assert.equal((replay.json() as { data?: unknown }).data, undefined);
  assert.equal((await build("contract-build-2")).statusCode, 200); // queue now 2/2
  const third = await build("contract-build-3");
  assert.equal(third.statusCode, 400);
  assert.deepEqual(third.json(), { commandId: "contract-build-3", result: "rejected", code: "QUEUE_LIMIT_REACHED" });
  await server.app.close();
});
test("early-rejected commands (unauthenticated, banned, rate-limited) conform to the CommandResponse contract", async () => {
  const server = createServer();
  const login = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "Early Reject Player", factionId: "meridian" } });
  const session = login.json() as { token: string; player: { id: string } };
  const headers = { authorization: `Bearer ${session.token}` };

  // Unauthenticated: 401 echoes the commandId and the rejected result.
  const unauth = await server.app.inject({ method: "POST", url: "/api/commands/build", payload: { commandId: "reject-unauth-1", cityId: "any", buildingId: "warehouse", queueType: "build" } });
  assert.equal(unauth.statusCode, 401);
  assert.deepEqual(unauth.json(), { commandId: "reject-unauth-1", result: "rejected", code: "UNAUTHORIZED" });

  // Banned player: 403.
  server.store.setPlayerStatus(session.player.id, "banned");
  const banned = await server.app.inject({ method: "POST", url: "/api/commands/build", headers, payload: { commandId: "reject-banned-1", cityId: "any", buildingId: "warehouse", queueType: "build" } });
  assert.equal(banned.statusCode, 403);
  assert.deepEqual(banned.json(), { commandId: "reject-banned-1", result: "rejected", code: "ACCOUNT_BANNED" });

  // Fresh player trips the spy launch limit (5/min): the 6th attempt is rejected.
  const second = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "Early Reject Two", factionId: "bastion" } });
  const secondSession = second.json() as { token: string; player: { id: string } };
  const rlHeaders = { authorization: `Bearer ${secondSession.token}` };
  for (let index = 1; index <= 5; index++) {
    const attempt = await server.app.inject({ method: "POST", url: "/api/commands/spy/launch", headers: rlHeaders, payload: { commandId: `reject-rl-${index}` } });
    assert.notEqual(attempt.statusCode, 429, `attempt ${index} stays inside the limit`);
  }
  const limited = await server.app.inject({ method: "POST", url: "/api/commands/spy/launch", headers: rlHeaders, payload: { commandId: "reject-rl-6" } });
  assert.equal(limited.statusCode, 429);
  assert.deepEqual(limited.json(), { commandId: "reject-rl-6", result: "rejected", code: "RATE_LIMITED" });
  await server.app.close();
});

test("logistics REST flow supports retry-safe commands", async () => {
  const server = createServer();
  const login = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "Logistics Player", factionId: "meridian" } });
  const session = login.json() as { token: string; player: { id: string }; snapshot: { cities: Array<{ id: string; playerId: string }>; logistics: { resourceNodes: Array<{ id: string; resourceType: string }> } } };
  const headers = { authorization: `Bearer ${session.token}` };
  const city = server.store.snapshot.cities.find(item => item.playerId === session.player.id)!;
  city.buildings.road_depot = 1;
  server.store.logistics.syncDepots(server.store.snapshot);
  const other = server.store.snapshot.cities.find(item => item.id !== city.id)!;
  other.playerId = session.player.id;
  const node = session.snapshot.logistics.resourceNodes.find(item => item.resourceType === "wood")!;
  const harvest = await server.app.inject({ method: "POST", url: "/api/commands/harvest", headers, payload: { commandId: "rest-harvest-1", nodeId: node.id, cityId: city.id, amount: 50 } });
  assert.equal(harvest.statusCode, 200);
  const retry = await server.app.inject({ method: "POST", url: "/api/commands/harvest", headers, payload: { commandId: "rest-harvest-1", nodeId: node.id, cityId: city.id, amount: 50 } });
  assert.equal(retry.statusCode, 200);
  assert.equal(server.store.snapshot.cities.find(item => item.id === city.id)!.resources.wood, 550);
  const route = await server.app.inject({ method: "POST", url: "/api/commands/routes", headers, payload: { commandId: "rest-route-1", sourceCityId: city.id, destinationCityId: other.id } });
  assert.equal(route.statusCode, 200);
  const routeId = route.json().data.id as string;
  const caravan = await server.app.inject({ method: "POST", url: "/api/commands/caravans", headers, payload: { commandId: "rest-caravan-1", routeId, cargo: { wood: 10, stone: 10, iron: 0 } } });
  assert.equal(caravan.statusCode, 200);
  assert.equal(caravan.json().data.status, "moving");
  await server.app.close();
});

test("alliance and treaty REST flows are exposed in snapshots", async () => {
  const server = createServer();
  const firstLogin = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "Diplomacy Alpha", factionId: "meridian" } });
  const secondLogin = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "Diplomacy Beta", factionId: "bastion" } });
  const first = firstLogin.json() as { token: string; player: { id: string }; snapshot: { cities: Array<{ id: string; playerId: string }>; alliances: unknown[]; treaties: unknown[] } };
  const second = secondLogin.json() as { token: string; player: { id: string }; snapshot: { cities: Array<{ id: string; playerId: string }> } };
  const firstHeaders = { authorization: `Bearer ${first.token}` };
  const secondHeaders = { authorization: `Bearer ${second.token}` };

  assert.deepEqual(first.snapshot.alliances, []);
  assert.deepEqual(first.snapshot.treaties, []);

  const created = await server.app.inject({ method: "POST", url: "/api/commands/alliance/create", headers: firstHeaders, payload: { commandId: "rest-alliance-create-1", name: "Meridian Pact", tag: "MP" } });
  assert.equal(created.statusCode, 200);
  const allianceId = created.json().snapshot.alliances[0].id as string;

  const joined = await server.app.inject({ method: "POST", url: "/api/commands/alliance/join", headers: secondHeaders, payload: { commandId: "rest-alliance-join-1", allianceId } });
  assert.equal(joined.statusCode, 200);
  assert.equal(joined.json().snapshot.alliances[0].members.length, 2);

  const secondCityId = second.snapshot.cities.find(city => city.playerId === second.player.id)!.id;
  const contributed = await server.app.inject({ method: "POST", url: "/api/commands/alliance/contribute", headers: secondHeaders, payload: { commandId: "rest-alliance-contribute-1", cityId: secondCityId, resources: { wood: 10, stone: 10, iron: 10 } } });
  assert.equal(contributed.statusCode, 200);

  const proposed = await server.app.inject({ method: "POST", url: "/api/commands/treaty/propose", headers: firstHeaders, payload: { commandId: "rest-treaty-propose-1", targetPlayerId: second.player.id, treatyType: "non_aggression", durationSeconds: 3600 } });
  assert.equal(proposed.statusCode, 200);
  const treatyId = proposed.json().snapshot.treaties[0].id as string;

  const responded = await server.app.inject({ method: "POST", url: "/api/commands/treaty/respond", headers: secondHeaders, payload: { commandId: "rest-treaty-respond-1", treatyId, accept: true } });
  assert.equal(responded.statusCode, 200);
  assert.equal(responded.json().snapshot.treaties[0].status, "active");

  const broken = await server.app.inject({ method: "POST", url: "/api/commands/treaty/break", headers: firstHeaders, payload: { commandId: "rest-treaty-break-1", treatyId } });
  assert.equal(broken.statusCode, 200);
  assert.equal(broken.json().snapshot.treaties[0].status, "violated");

  const left = await server.app.inject({ method: "POST", url: "/api/commands/alliance/leave", headers: secondHeaders, payload: { commandId: "rest-alliance-leave-1" } });
  assert.equal(left.statusCode, 200);
  assert.equal(left.json().snapshot.alliances[0].members.length, 1);
  await server.app.close();
});

test("season archive requires auth and admin close is disabled or token protected", async () => { const server = createServer(); const originalToken = config.adminToken; try { config.adminToken = ""; const disabled = await server.app.inject({ method: "POST", url: "/api/admin/season/close", payload: { reason: "test close" } }); assert.equal(disabled.statusCode, 503); config.adminToken = "secret-test-token"; const denied = await server.app.inject({ method: "POST", url: "/api/admin/season/close", headers: { authorization: "Bearer wrong" }, payload: { reason: "test close" } }); assert.equal(denied.statusCode, 401); const closed = await server.app.inject({ method: "POST", url: "/api/admin/season/close", headers: { authorization: "Bearer secret-test-token" }, payload: { reason: "test close" } }); assert.equal(closed.statusCode, 200); assert.equal(closed.json().status, "finalized"); const privateArchive = await server.app.inject({ method: "GET", url: "/api/season-history" }); assert.equal(privateArchive.statusCode, 401); } finally { config.adminToken = originalToken; await server.app.close(); } });

test("GET /api/battles: participant-only history with keyset pagination (in-memory path)", async () => {
  const server = createServer();
  const login = (displayName: string) => server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName, factionId: "meridian" } });
  const [a, b, c] = [await login("Battle Viewer A"), await login("Battle Viewer B"), await login("Battle Viewer C")];
  const playerA = a.json() as { token: string; player: { id: string } };
  const playerB = b.json() as { player: { id: string } };
  const playerC = c.json() as { player: { id: string } };
  const bId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const report = (id: string, attackerId: string, defenderId: string, resolvedAt: string): BattleReport => ({
    id, kingdomId: "k1", seasonId: "s1", tileX: 3, tileY: 4, terrain: "plains" as const, victor: "attacker" as const, seed: 1, resolvedAt, rounds: [],
    attacker: { ownerType: "player", playerId: attackerId, armyId: `${id}-a`, unitType: "infantry", formation: "line", strengthBefore: 100, strengthAfter: 50, moraleBefore: 70, moraleAfter: 60, supplyBefore: 100 },
    defender: { ownerType: "player", playerId: defenderId, armyId: `${id}-d`, unitType: "archer", formation: "line", strengthBefore: 90, strengthAfter: 30, moraleBefore: 70, moraleAfter: 55, supplyBefore: 100 },
  });
  // r1-r3: A fights B; r4: B vs C; r5: C attacks A; r6 is A vs B with a timestamp tie to r2 (id desc breaks it).
  // Cursor values must be UUIDs (the API validates them), so fixtures use deterministic v4-space ids.
  server.store.snapshot.battleReports = [
    report(bId(1), playerA.player.id, playerB.player.id, "2026-09-01T01:00:00.000Z"),
    report(bId(2), playerA.player.id, playerB.player.id, "2026-09-01T02:00:00.000Z"),
    report(bId(3), playerA.player.id, playerB.player.id, "2026-09-01T03:00:00.000Z"),
    report(bId(4), playerB.player.id, playerC.player.id, "2026-09-01T04:00:00.000Z"),
    report(bId(5), playerC.player.id, playerA.player.id, "2026-09-01T05:00:00.000Z"),
    report(bId(6), playerA.player.id, playerB.player.id, "2026-09-01T02:00:00.000Z"),
  ];
  const get = (token: string, query = "") => server.app.inject({ method: "GET", url: `/api/battles${query}`, headers: { authorization: `Bearer ${token}` } });

  assert.equal((await server.app.inject({ method: "GET", url: "/api/battles" })).statusCode, 401, "requires auth");

  const first = await get(playerA.token);
  assert.equal(first.statusCode, 200, first.body);
  const page1 = first.json() as { items: Array<{ id: string; resolvedAt: string }>; nextCursor?: string };
  // A fights in r1-r3 + r6 (A vs B) and r5 (C attacks A) but not r4 (B vs C).
  assert.deepEqual(page1.items.map(item => item.id), [bId(5), bId(3), bId(6), bId(2), bId(1)], "newest-first, resolvedAt desc with id desc tie-break");
  assert.equal(page1.nextCursor, undefined, "default limit 20 covers all 5");

  const limited = (await get(playerA.token, "?limit=2")).json() as { items: Array<{ id: string }>; nextCursor: string };
  assert.deepEqual(limited.items.map(item => item.id), [bId(5), bId(3)]);
  const second = (await get(playerA.token, `?limit=2&cursor=${encodeURIComponent(limited.nextCursor)}`)).json() as { items: Array<{ id: string }>; nextCursor: string };
  assert.deepEqual(second.items.map(item => item.id), [bId(6), bId(2)]);
  const third = (await get(playerA.token, `?limit=2&cursor=${encodeURIComponent(second.nextCursor)}`)).json() as { items: Array<{ id: string }>; nextCursor?: string };
  assert.deepEqual(third.items.map(item => item.id), [bId(1)]);
  assert.equal(third.nextCursor, undefined, "last page has no cursor");

  const pageB = (await get((b.json() as { token: string }).token)).json() as { items: Array<{ id: string }> };
  assert.deepEqual(pageB.items.map(item => item.id), [bId(4), bId(3), bId(6), bId(2), bId(1)], "B sees B-vs-C and B-vs-A battles");
  const pageC = (await get((c.json() as { token: string }).token)).json() as { items: Array<{ id: string }> };
  assert.deepEqual(pageC.items.map(item => item.id), [bId(5), bId(4)], "C sees only own battles");

  assert.equal((await get(playerA.token, "?limit=0")).statusCode, 400, "non-positive limit");
  assert.equal((await get(playerA.token, "?limit=abc")).statusCode, 400, "non-integer limit");
  const clamped = (await get(playerA.token, "?limit=100")).json() as { items: unknown[] };
  assert.equal(clamped.items.length, 5, "limit clamped down, not up");
  const badCursor = await get(playerA.token, "?cursor=not-base64");
  assert.equal(badCursor.statusCode, 400, "malformed cursor");
  assert.deepEqual((badCursor.json() as { code: string }).code, "INVALID_CURSOR");
  // Cursor bodies must carry a real timestamp and a UUID: garbage values used to
  // leak PostgreSQL errors as 500s.
  const badDate = Buffer.from(JSON.stringify({ createdAt: "not-a-date", id: "00000000-0000-4000-8000-000000000099" })).toString("base64url");
  const badDateResponse = await get(playerA.token, `?cursor=${encodeURIComponent(badDate)}`);
  assert.equal(badDateResponse.statusCode, 400, "unparseable createdAt");
  assert.deepEqual((badDateResponse.json() as { code: string }).code, "INVALID_CURSOR");
  const badId = Buffer.from(JSON.stringify({ createdAt: "2026-08-01T00:00:00.000Z", id: "not-a-uuid" })).toString("base64url");
  const badIdResponse = await get(playerA.token, `?cursor=${encodeURIComponent(badId)}`);
  assert.equal(badIdResponse.statusCode, 400, "non-UUID id");
  assert.deepEqual((badIdResponse.json() as { code: string }).code, "INVALID_CURSOR");
  const impossibleDate = Buffer.from(JSON.stringify({ createdAt: "2020-02-30", id: "00000000-0000-4000-8000-000000000099" })).toString("base64url");
  const impossibleDateResponse = await get(playerA.token, `?cursor=${encodeURIComponent(impossibleDate)}`);
  assert.equal(impossibleDateResponse.statusCode, 400, "calendar-invalid timestamps must not reach PostgreSQL");
  assert.deepEqual((impossibleDateResponse.json() as { code: string }).code, "INVALID_CURSOR");
  const staleCursor = (await get(playerA.token, `?limit=2&cursor=${encodeURIComponent(Buffer.from(JSON.stringify({ createdAt: "2999-01-01T00:00:00.000Z", id: "00000000-0000-4000-8000-000000000099" })).toString("base64url"))}`)).json() as { items: Array<{ id: string }> };
  assert.deepEqual(staleCursor.items.map(item => item.id), [bId(5), bId(3)], "unknown cursor restarts from the newest page (stale data tolerance)");
  await server.app.close();
});

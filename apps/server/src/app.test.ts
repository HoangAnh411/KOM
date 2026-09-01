import test from "node:test";
import assert from "node:assert/strict";
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

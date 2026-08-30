import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "./app.js";

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
  const routeId = route.json().result.id as string;
  const caravan = await server.app.inject({ method: "POST", url: "/api/commands/caravans", headers, payload: { commandId: "rest-caravan-1", routeId, cargo: { wood: 10, stone: 10, iron: 0 } } });
  assert.equal(caravan.statusCode, 200);
  assert.equal(caravan.json().result.status, "moving");
  await server.app.close();
});
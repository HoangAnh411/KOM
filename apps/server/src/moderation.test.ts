import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "./app.js";
import { config } from "./config.js";

test("admin ban freezes player entities and blocks commands", async () => {
  const server = createServer(); const original = config.adminToken; config.adminToken = "moderation-test-token";
  try {
    const login = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "Moderation target", factionId: "meridian" } });
    const body = login.json() as { token: string; player: { id: string }; snapshot: { cities: Array<{ id: string; playerId: string }> } };
    const result = await server.app.inject({ method: "POST", url: "/api/admin/player/ban", headers: { authorization: "Bearer moderation-test-token" }, payload: { playerId: body.player.id, reason: "abuse" } });
    assert.equal(result.statusCode, 200); assert.equal(result.json().status, "banned"); assert.equal(server.store.findPlayer(body.player.id)?.status, "banned"); assert.equal(server.store.snapshot.cities.find(city => city.playerId === body.player.id)?.frozen, true);
    const blocked = await server.app.inject({ method: "POST", url: "/api/commands/build", headers: { authorization: `Bearer ${body.token}` }, payload: { commandId: "moderation-command-1", cityId: body.snapshot.cities.find(city => city.playerId === body.player.id)?.id, buildingId: "warehouse", queueType: "build" } });
    // Banning revokes the session immediately, so an already-issued token no longer
    // reaches command authorization. Target-side frozen guards are covered below.
    assert.equal(blocked.statusCode, 401); assert.equal(blocked.json().code, "UNAUTHORIZED");
    const unban = await server.app.inject({ method: "POST", url: "/api/admin/player/unban", headers: { authorization: "Bearer moderation-test-token" }, payload: { playerId: body.player.id, reason: "reviewed" } });
    assert.equal(unban.statusCode, 200); assert.equal(server.store.findPlayer(body.player.id)?.status, "active");
  } finally { config.adminToken = original; await server.app.close(); }
});

test("frozen targets reject combat, espionage and diplomacy commands", async () => {
  const server = createServer(); const original = config.adminToken; config.adminToken = "moderation-target-token";
  try {
    const attackerLogin = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "Active attacker", factionId: "meridian" } });
    const targetLogin = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "Frozen target", factionId: "bastion" } });
    const attacker = attackerLogin.json() as { token: string; player: { id: string } }; const target = targetLogin.json() as { player: { id: string } };
    const sourceArmyId = randomUUID(); const targetArmyId = randomUUID();
    server.store.snapshot.armies.push({ id: sourceArmyId, ownerType: "player", ownerPlayerId: attacker.player.id, x: 1, y: 1, unitType: "infantry", strength: 100, morale: 100, formation: "line", supply: 100 }, { id: targetArmyId, ownerType: "player", ownerPlayerId: target.player.id, x: 2, y: 1, unitType: "infantry", strength: 100, morale: 100, formation: "line", supply: 100 });
    await server.app.inject({ method: "POST", url: "/api/admin/player/ban", headers: { authorization: "Bearer moderation-target-token" }, payload: { playerId: target.player.id, reason: "target freeze test" } });
    for (const request of [
      { url: "/api/commands/attack", payload: { commandId: "frozen-attack-1", armyId: sourceArmyId, targetArmyId } },
      { url: "/api/commands/spy/launch", payload: { commandId: "frozen-spy-001", targetPlayerId: target.player.id, missionType: "scout" } },
      { url: "/api/commands/treaty/propose", payload: { commandId: "frozen-treaty-1", targetPlayerId: target.player.id, treatyType: "non_aggression", durationSeconds: 3600 } },
    ]) { const response = await server.app.inject({ method: "POST", url: request.url, headers: { authorization: `Bearer ${attacker.token}` }, payload: request.payload }); assert.equal(response.statusCode, 403); assert.equal(response.json().code, "TARGET_FROZEN"); }
  } finally { config.adminToken = original; await server.app.close(); }
});

test("moderation is idempotent and unban shifts paused deadlines", async () => {
  const server = createServer(); const player = server.store.addDevPlayer("Paused player", "veiled"); const city = server.store.snapshot.cities.find(item => item.playerId === player.id)!;
  const originalDeadline = Date.now() + 30_000; city.queues.push({ id: randomUUID(), type: "build", buildingId: "warehouse", targetLevel: 1, startedAt: new Date().toISOString(), completesAt: new Date(originalDeadline).toISOString() });
  const first = await server.store.moderatePlayer(player.id, "banned", "test pause"); const second = await server.store.moderatePlayer(player.id, "banned", "duplicate");
  assert.equal(first.alreadyApplied, false); assert.equal(second.alreadyApplied, true); assert.equal(server.store.ledger.all().filter(event => event.eventType === "player.ban" && event.aggregateId === player.id).length, 1);
  const pausedAt = new Date(Date.now() - 60_000).toISOString(); player.bannedAt = pausedAt; city.frozenAt = pausedAt;
  await server.store.moderatePlayer(player.id, "active", "appeal accepted");
  assert.ok(Date.parse(city.queues[0].completesAt) >= originalDeadline + 59_000); assert.equal(city.frozen, false); await server.app.close();
});

import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createServer } from "./app.js";
import { config } from "./config.js";

test("WebSocket sends an authenticated snapshot", async () => {
  const server = createServer();
  await server.app.listen({ host: "127.0.0.1", port: 0 });
  const address = server.app.server.address();
  assert.ok(address && typeof address !== "string");
  const login = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "WebSocket Player", factionId: "bastion" } });
  const { token } = login.json() as { token: string };
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  const message = await new Promise<{ type: string; payload?: { logistics?: unknown } }>((resolve, reject) => { socket.once("open", () => socket.send(JSON.stringify({ type: "AUTH", token }))); socket.once("message", raw => resolve(JSON.parse(raw.toString()))); socket.once("error", reject); });
  assert.equal(message.type, "SNAPSHOT");
  assert.ok(message.payload?.logistics);
  socket.close();
  await server.app.close();
});

test("WebSocket rejects URL tokens and requires an AUTH message", async () => {
  const server = createServer(); await server.app.listen({ host: "127.0.0.1", port: 0 });
  const address = server.app.server.address(); assert.ok(address && typeof address !== "string");
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws?token=must-not-authenticate`);
  const code = await new Promise<number>((resolve, reject) => { socket.once("open", () => socket.send(JSON.stringify({ type: "AUTH", token: "invalid" }))); socket.once("close", resolve); socket.once("error", reject); });
  assert.equal(code, 4401); await server.app.close();
});

test("banning a player closes their authenticated WebSocket", async () => {
  const original = config.adminToken; config.adminToken = "websocket-ban-token"; const server = createServer(); await server.app.listen({ host: "127.0.0.1", port: 0 });
  try { const address = server.app.server.address(); assert.ok(address && typeof address !== "string"); const login = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "WebSocket Ban Target", factionId: "veiled" } }); const session = login.json() as { token: string; player: { id: string } }; const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`); await new Promise<void>((resolve, reject) => { socket.once("open", () => socket.send(JSON.stringify({ type: "AUTH", token: session.token }))); socket.once("message", () => resolve()); socket.once("error", reject); }); const closed = new Promise<number>((resolve, reject) => { socket.once("close", resolve); socket.once("error", reject); }); const ban = await server.app.inject({ method: "POST", url: "/api/admin/player/ban", headers: { authorization: "Bearer websocket-ban-token" }, payload: { playerId: session.player.id, reason: "websocket moderation" } }); assert.equal(ban.statusCode, 200); assert.equal(await closed, 4401); }
  finally { config.adminToken = original; await server.app.close(); }
});

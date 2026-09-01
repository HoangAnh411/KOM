import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";

process.env.AUTH_MODE = "dev";
process.env.DATABASE_URL = "";
process.env.REDIS_URL = "";
process.env.PORT = "0";

const { createServer } = await import("./app.js");

test("graceful shutdown stops timers, saves state and closes WebSockets with code 1012", async () => {
  const server = createServer();
  await server.start();
  const address = server.app.server.address();
  assert.ok(address && typeof address !== "string");
  const login = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "Shutdown Player", factionId: "meridian" } });
  const { token, player } = login.json() as { token: string; player: { id: string } };
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  await new Promise<void>((resolve, reject) => { socket.once("open", () => socket.send(JSON.stringify({ type: "AUTH", token }))); socket.once("message", () => resolve()); socket.once("error", reject); });
  const closed = new Promise<{ code: number; reason: string }>((resolve, reject) => { socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() })); socket.once("error", reject); });
  const readyWhileUp = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
  assert.equal(readyWhileUp.status, 503, "dev mode without postgres reports not-ready");
  const readyBody = await readyWhileUp.json();
  assert.ok(readyBody.checks?.includes("postgres"), `readiness should list postgres, got ${JSON.stringify(readyBody)}`);
  await server.stop();
  const closing = await closed;
  assert.equal(closing.code, 1012, `expected 1012, got ${closing.code}`);
  assert.equal(closing.reason, "SERVICE_RESTART");
  assert.ok(server.store.findPlayer(player.id), "state survives a graceful stop");
  await server.app.close();
});

test("readiness reports state before start and shutdown rejects after stop flag", async () => {
  const server = createServer();
  const before = await server.app.inject({ method: "GET", url: "/health/ready" });
  assert.equal(before.statusCode, 503);
  assert.equal(before.json().reason, "state_not_loaded");
  await server.start();
  const address = server.app.server.address();
  assert.ok(address && typeof address !== "string");
  await server.stop();
  let refused = false;
  try {
    await fetch(`http://127.0.0.1:${address.port}/health/ready`);
  } catch {
    refused = true;
  }
  assert.ok(refused, "no requests are accepted after a graceful stop");
  assert.ok(server.store.snapshot.kingdom.id.length > 0, "state survives a graceful stop");
  await server.app.close();
});
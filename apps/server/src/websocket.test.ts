import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createServer } from "./app.js";

test("WebSocket sends an authenticated snapshot", async () => {
  const server = createServer();
  await server.app.listen({ host: "127.0.0.1", port: 0 });
  const address = server.app.server.address();
  assert.ok(address && typeof address !== "string");
  const login = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "WebSocket Player", factionId: "bastion" } });
  const { token } = login.json() as { token: string };
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws?token=${encodeURIComponent(token)}`);
  const message = await new Promise<{ type: string; payload?: { logistics?: unknown } }>((resolve, reject) => { socket.once("message", raw => resolve(JSON.parse(raw.toString()))); socket.once("error", reject); });
  assert.equal(message.type, "SNAPSHOT");
  assert.ok(message.payload?.logistics);
  socket.close();
  await server.app.close();
});
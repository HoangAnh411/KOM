import test from "node:test";
import assert from "node:assert/strict";

process.env.AUTH_MODE = "password";
process.env.DATABASE_URL = "";
process.env.METRICS_TOKEN = "metrics-secret-token-value-32chars-min";
process.env.CLIENT_ORIGIN = "http://localhost:5173";

const { createServer } = await import("./app.js");

test("responses carry security headers", async () => {
  const server = createServer();
  const response = await server.app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.match(String(response.headers["content-security-policy"]), /default-src 'none'/);
  await server.app.close();
});

test("health endpoints are available and ready reports state", async () => {
  const server = createServer();
  const health = await server.app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().ok, true);
  assert.equal((await server.app.inject({ method: "GET", url: "/health/live" })).json().ok, true);
  const ready = await server.app.inject({ method: "GET", url: "/health/ready" });
  assert.equal(ready.statusCode, 503);
  assert.deepEqual(ready.json(), { ready: false, reason: "state_not_loaded" });
  await server.app.close();
});

test("/metrics requires a valid METRICS_TOKEN in password mode", async () => {
  const server = createServer();
  const denied = await server.app.inject({ method: "GET", url: "/metrics" });
  assert.equal(denied.statusCode, 401);
  const wrong = await server.app.inject({ method: "GET", url: "/metrics", headers: { authorization: "Bearer wrong-token" } });
  assert.equal(wrong.statusCode, 401);
  const allowed = await server.app.inject({ method: "GET", url: "/metrics", headers: { authorization: "Bearer metrics-secret-token-value-32chars-min" } });
  assert.equal(allowed.statusCode, 200);
  assert.ok(allowed.body.includes("kingdom_commands_total"), allowed.body.slice(0, 200));
  await server.app.close();
});

test("refresh and logout require an exact Origin match", async () => {
  const server = createServer();
  const noOrigin = await server.app.inject({ method: "POST", url: "/api/auth/refresh" });
  assert.equal(noOrigin.statusCode, 403);
  assert.equal(noOrigin.json().code, "ORIGIN_NOT_ALLOWED");
  const wrongOrigin = await server.app.inject({ method: "POST", url: "/api/auth/refresh", headers: { origin: "https://evil.example" } });
  assert.equal(wrongOrigin.statusCode, 403);
  assert.equal(wrongOrigin.json().code, "ORIGIN_NOT_ALLOWED");
  const logoutOrigin = await server.app.inject({ method: "POST", url: "/api/auth/logout", headers: { origin: "https://evil.example" } });
  assert.equal(logoutOrigin.statusCode, 403);
  const correctOrigin = await server.app.inject({ method: "POST", url: "/api/auth/refresh", headers: { origin: "http://localhost:5173" } });
  assert.equal(correctOrigin.statusCode, 401, "a well-formed refresh without a refresh_token cookie is UNAUTHORIZED");
  await server.app.close();
});

test("request bodies are limited to 64 KB", async () => {
  const server = createServer();
  const oversized = "x".repeat(70 * 1024);
  const response = await server.app.inject({ method: "POST", url: "/api/auth/register", headers: { origin: "http://localhost:5173", "content-type": "application/json" }, payload: JSON.stringify({ username: "u", password: oversized }) });
  assert.ok([413, 431].includes(response.statusCode), `expected 413/431, got ${response.statusCode}`);
  await server.app.close();
});
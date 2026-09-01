// k6 load test for the closed-beta production gate.
//
//   k6 run e2e/loadtest/loadtest.js
//
// Scenarios: 100 persistent WebSockets for 15 min, 10 REST commands/s, a reconnect
// burst and duplicate commandId idempotency. Thresholds match the Phase 7A gate:
// command p95 < 250 ms, p99 < 750 ms, non-gameplay errors < 1 %, WS connect > 99 %.

import ws from "k6/ws";
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const fixture = JSON.parse(open("loadtest-fixture.json"));
const BASE = __ENV.LOADTEST_BASE_URL ?? fixture.baseUrl ?? "http://localhost:3000";
const COMMAND_DURATION = new Trend("command_duration_ms");
const COMMAND_ERRORS = new Rate("command_errors");
const WS_CONNECT_OK = new Rate("ws_connect_ok");
const WS_RECONNECT_OK = new Rate("ws_reconnect_ok");
const DUPLICATE_OK = new Rate("duplicate_idempotent");

export const options = {
  scenarios: {
    steady: { executor: "per-vu-iterations", vus: 100, iterations: 1, maxDuration: "16m", exec: "steadyClient", startTime: "5s" },
    commands: { executor: "constant-arrival-rate", rate: 10, timeUnit: "1s", duration: "15m", preAllocatedVUs: 10, maxVUs: 30, exec: "issueCommand" },
    reconnect: { executor: "shared-iterations", vus: 20, iterations: 80, maxDuration: "2m", exec: "reconnectOnce", startTime: "30s" },
    duplicate: { executor: "shared-iterations", vus: 1, iterations: 6, maxDuration: "1m", exec: "duplicateCommand", startTime: "5s" },
  },
  thresholds: {
    command_duration_ms: ["p(95)<250", "p(99)<750"],
    command_errors: ["rate<0.01"],
    ws_connect_ok: ["rate>0.99"],
    ws_reconnect_ok: ["rate>0.99"],
    duplicate_idempotent: ["rate==1"],
    checks: ["rate>0.99"],
  },
};

function tokenFor(index) {
  return fixture.users[index % fixture.users.length].token;
}

function openAuthenticatedSocket(token, marker, holdMs = 0) {
  const url = BASE.replace(/^http/, "ws") + "/ws";
  let succeeded = false; let recorded = false;
  const outcome = marker === "connect" ? WS_CONNECT_OK : WS_RECONNECT_OK;
  ws.connect(url, {}, socket => {
    socket.on("open", () => socket.send(JSON.stringify({ type: "AUTH", token })));
    socket.on("message", () => {
      succeeded = true;
      if (!recorded) { outcome.add(true); recorded = true; }
      if (!holdMs) socket.close(1000);
    });
    socket.on("error", () => { if (!recorded) { outcome.add(false); recorded = true; } });
    socket.on("close", () => { if (!succeeded && !recorded) { outcome.add(false); recorded = true; } });
    socket.setTimeout(holdMs || 15000, () => socket.close(1000));
  });
}

export function steadyClient() {
  openAuthenticatedSocket(tokenFor(__VU), "connect", 15 * 60 * 1000);
}

export function reconnectOnce() {
  for (let i = 0; i < 4; i += 1) {
    openAuthenticatedSocket(tokenFor(__VU + i), "reconnect");
    sleep(0.3);
  }
}

export function issueCommand() {
  const user = fixture.users[__VU % fixture.users.length];
  const started = Date.now();
  const response = http.post(`${BASE}/api/commands/harvest`, JSON.stringify({ commandId: randomCommandId(), cityId: user.cityId, nodeId: fixture.nodes[0], amount: 10 }), { headers: { authorization: `Bearer ${user.token}`, "content-type": "application/json" } });
  COMMAND_DURATION.add(Date.now() - started);
  const body = response.json();
  const gameplayRejection = body && typeof body === "object" && typeof body.code === "string" && ["INSUFFICIENT_RESOURCES", "RESOURCE_NODE_EMPTY", "INVALID_COMMAND"].includes(body.code);
  const ok = response.status === 200 || (response.status === 400 && gameplayRejection);
  COMMAND_ERRORS.add(!ok);
  check(response, { "command: handled without unexpected error": () => ok });
  sleep(0.5);
}

export function duplicateCommand() {
  const user = fixture.users[__VU % fixture.users.length];
  const commandId = `dup-${__VU}-${Date.now()}`;
  const results = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = http.post(`${BASE}/api/commands/build`, JSON.stringify({ commandId, cityId: user.cityId, buildingId: "warehouse", queueType: "build" }), { headers: { authorization: `Bearer ${user.token}`, "content-type": "application/json" } });
    results.push({ status: response.status, result: response.json().result });
  }
  const accepted = results.filter(r => r.result === "accepted").length;
  const duplicated = results.filter(r => r.result === "already_processed").length;
  const idempotent = accepted === 1 && duplicated === results.length - 1 && results.every(r => r.status === 200);
  DUPLICATE_OK.add(idempotent);
  check(idempotent, { "duplicate commandId: exactly one execution": () => idempotent });
}

function randomCommandId() { return "load-" + __VU + "-" + Date.now() + "-" + Math.floor(Math.random() * 1e6); }

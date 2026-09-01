import assert from "node:assert/strict";
import test from "node:test";
import { reduceConnection, shouldNotifyRestore, type ConnectionState } from "./connect.js";

test("open alone is NOT online — auth handshake required", () => {
  assert.equal(reduceConnection("connecting", { type: "open" }), "connecting");
  assert.equal(reduceConnection("reconnecting", { type: "open" }), "reconnecting", "loss label survives the reopen until handshake");
});

test("first snapshot (authed) brings the state online", () => {
  assert.equal(reduceConnection("connecting", { type: "authed" }), "online");
});

test("socket loss moves to reconnecting", () => {
  assert.equal(reduceConnection("online", { type: "lost" }), "reconnecting");
});

test("browser offline pins the state to offline regardless of socket state", () => {
  assert.equal(reduceConnection("online", { type: "offline" }), "offline");
  assert.equal(reduceConnection("reconnecting", { type: "offline" }), "offline");
});

test("browser back online restarts the handshake (connecting)", () => {
  assert.equal(reduceConnection("offline", { type: "online" }), "connecting");
});

test("restore takeover: any re-establishment notices; first-ever connect is silent (ever-online guard lives in the provider)", () => {
  assert.equal(shouldNotifyRestore("reconnecting", "online"), true);
  assert.equal(shouldNotifyRestore("connecting", "online"), true, "offline blip path (offline→connecting→online)");
  assert.equal(shouldNotifyRestore("connecting", "connecting"), false);
  assert.equal(shouldNotifyRestore("online", "online"), false, "no churn while online");
  assert.equal(shouldNotifyRestore("online", "reconnecting"), false);
  assert.equal(shouldNotifyRestore("reconnecting", "reconnecting"), false);
  assert.equal(shouldNotifyRestore("offline", "connecting"), false);
  assert.equal(shouldNotifyRestore("reconnecting", "offline"), false);
  assert.equal(shouldNotifyRestore("reconnecting", "connecting"), false);
  assert.equal(shouldNotifyRestore("offline", "online"), false, "offline→online passes through connecting first");
});

test("full outage cycle: exactly one restore notice after recovery", () => {
  let state: ConnectionState = "online";
  const notices: boolean[] = [];
  for (const event of [{ type: "lost" }, { type: "open" }, { type: "authed" }] as const) {
    const previous = state;
    state = reduceConnection(state, event);
    notices.push(shouldNotifyRestore(previous, state));
  }
  assert.deepEqual(notices, [false, false, true], "one restore notice after recovery, none while down");
  assert.equal(state, "online");
});

test("offline blip cycle notices once when re-establishing", () => {
  let state: ConnectionState = "online";
  const notices: boolean[] = [];
  for (const event of [{ type: "offline" }, { type: "online" }, { type: "authed" }] as const) {
    const previous = state;
    state = reduceConnection(state, event);
    notices.push(shouldNotifyRestore(previous, state));
  }
  assert.deepEqual(notices, [false, false, true]);
});
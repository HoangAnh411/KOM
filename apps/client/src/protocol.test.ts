import assert from "node:assert/strict";
import test from "node:test";
import { PROTOCOL_VERSION } from "@kingdoms/shared";
import { protocolBlockedMessage } from "./protocol.js";

test("no snapshot is not blocked", () => {
  assert.equal(protocolBlockedMessage(undefined), undefined);
});

test("missing protocolVersion locks commands with a refresh prompt", () => {
  const message = protocolBlockedMessage({});
  assert.ok(message);
  assert.match(message, /tải lại/);
});

test("mismatched protocolVersion locks commands", () => {
  const message = protocolBlockedMessage({ protocolVersion: PROTOCOL_VERSION + 1 });
  assert.ok(message);
  assert.match(message, /tải lại/);
});

test("matching protocolVersion passes", () => {
  assert.equal(protocolBlockedMessage({ protocolVersion: PROTOCOL_VERSION }), undefined);
});

// Version 1 is the world before the terrain grid left the wire, and it has to stay
// refused *by name*: a v1 client against this server never receives a `terrainMap` and
// would paint the whole world plains, while a v2 client against a v1 server draws the
// authored map that server never agreed to. Neither side errors — both just disagree
// about the ground battles are resolved on.
test("a pre-terrain-split snapshot (v1) is refused", () => {
  const message = protocolBlockedMessage({ protocolVersion: 1 });
  assert.ok(message);
  assert.match(message, /tải lại/);
});
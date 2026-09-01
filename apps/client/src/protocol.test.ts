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
import assert from "node:assert/strict";
import test from "node:test";
import {
  DiagnosticBuffer,
  DIAGNOSTIC_MAX_CAPACITY,
  installGlobalDiagnosticCapture,
  normalizeError,
  redactValue,
} from "./diagnostics.js";

test("ring buffer retains only the newest bounded entries", () => {
  const buffer = new DiagnosticBuffer(2, () => new Date("2026-01-02T03:04:05.000Z"));
  buffer.add({ kind: "first", message: "one" });
  buffer.add({ kind: "second", message: "two" });
  buffer.add({ kind: "third", message: "three" });
  assert.deepEqual(buffer.snapshot().map(entry => [entry.sequence, entry.kind]), [[2, "second"], [3, "third"]]);
  assert.equal(new DiagnosticBuffer(999_999).capacity, DIAGNOSTIC_MAX_CAPACITY);
});

test("redacts sensitive keys and secret-like text without mutating input", () => {
  const input = {
    password: "hunter2",
    nested: { authorization: "Bearer abc.def.ghi", safe: "request failed for 192.168.1.42" },
    message: "token=super-secret email person@example.com",
  };
  const redacted = redactValue(input);
  const text = JSON.stringify(redacted);
  assert.equal(input.password, "hunter2");
  for (const secret of ["hunter2", "abc.def.ghi", "super-secret", "person@example.com", "192.168.1.42"]) {
    assert.equal(text.includes(secret), false, `must not retain ${secret}`);
  }
  assert.match(text, /REDACTED/);
});

test("normalizes errors to safe bounded fields", () => {
  const error = new Error("password=do-not-keep for somebody@example.com");
  error.stack = "Error at C:\\Users\\Alice\\game\\file.ts token=secret";
  const normalized = normalizeError(error);
  const text = JSON.stringify(normalized);
  assert.equal(Object.keys(normalized).every(key => ["name", "message", "stack"].includes(key)), true);
  assert.equal(text.includes("do-not-keep"), false);
  assert.equal(text.includes("somebody@example.com"), false);
  assert.equal(text.includes("Alice"), false);
});

test("safe export is valid JSON and contains only sanitized snapshots", () => {
  const buffer = new DiagnosticBuffer(4, () => new Date("2026-01-02T03:04:05.000Z"));
  buffer.add({ kind: "api error!", message: "Bearer top-secret", details: { cookie: "session-value", status: 500 } });
  const exported = buffer.export();
  const parsed = JSON.parse(exported) as { format: string; entries: Array<{ kind: string; details: { status: number } }> };
  assert.equal(parsed.format, "kingdoms-client-diagnostics");
  assert.equal(parsed.entries[0]?.kind, "api_error_");
  assert.equal(parsed.entries[0]?.details.status, 500);
  assert.equal(exported.includes("top-secret"), false);
  assert.equal(exported.includes("session-value"), false);
});

test("global capture records errors and rejections and can be uninstalled", () => {
  type Listener = (event: { message?: string; error?: unknown; reason?: unknown }) => void;
  const listeners = new Map<string, Listener>();
  const target = {
    addEventListener(type: string, listener: Listener) { listeners.set(type, listener); },
    removeEventListener(type: string, listener: Listener) { if (listeners.get(type) === listener) listeners.delete(type); },
  };
  const buffer = new DiagnosticBuffer(5);
  const uninstall = installGlobalDiagnosticCapture(target, buffer);
  listeners.get("error")?.({ message: "token=bad", error: new Error("password=worse") });
  listeners.get("unhandledrejection")?.({ reason: "Bearer private" });
  const snapshot = buffer.snapshot();
  assert.deepEqual(snapshot.map(entry => entry.kind), ["global.error", "global.unhandled_rejection"]);
  assert.equal(JSON.stringify(snapshot).includes("bad"), false);
  assert.equal(JSON.stringify(snapshot).includes("worse"), false);
  assert.equal(JSON.stringify(snapshot).includes("private"), false);
  uninstall();
  assert.equal(listeners.size, 0);
});

test("handles circular and hostile diagnostic details", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  Object.defineProperty(circular, "password", { enumerable: true, get() { throw new Error("leaked"); } });
  const output = JSON.stringify(redactValue(circular));
  assert.match(output, /CIRCULAR/);
  assert.match(output, /REDACTED/);
  assert.equal(output.includes("leaked"), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const configUrl = new URL("../src/config.ts", import.meta.url).href;

function loadConfig(overrides: Record<string, string>, nodeEnv = "test"): { ok: boolean; output: string } {
  const script = `import("${configUrl}").then(m => console.log("CONFIG_OK:" + JSON.stringify(m.config))).catch(e => { console.error(e.message); process.exit(1); })`;
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, ...overrides, NODE_ENV: nodeEnv },
  });
  return { ok: result.status === 0, output: (result.stdout ?? "") + (result.stderr ?? "") };
}

test("dev defaults parse without DATABASE_URL or tokens", () => {
  const result = loadConfig({ DATABASE_URL: "", ADMIN_TOKEN: "", METRICS_TOKEN: "" });
  assert.ok(result.ok, result.output);
  assert.ok(result.output.includes('"authMode":"dev"'));
});

test("invalid CLIENT_ORIGIN is rejected in any mode", () => {
  const result = loadConfig({ CLIENT_ORIGIN: "not-a-url" });
  assert.equal(result.ok, false);
  assert.ok(result.output.includes("CLIENT_ORIGIN"), result.output);
});

test("production refuses AUTH_MODE=dev and short tokens", () => {
  const result = loadConfig({ AUTH_MODE: "dev", ADMIN_TOKEN: "short", METRICS_TOKEN: "short" }, "production");
  assert.equal(result.ok, false);
  assert.ok(result.output.includes("AUTH_MODE must be 'password'"), result.output);
  assert.ok(result.output.includes("ADMIN_TOKEN must be at least 32 characters"), result.output);
});

test("production requires DATABASE_URL and REDIS_URL", () => {
  const result = loadConfig({
    AUTH_MODE: "password", ADMIN_TOKEN: "a".repeat(32), METRICS_TOKEN: "b".repeat(32),
    DATABASE_URL: "", REDIS_URL: "",
  }, "production");
  assert.equal(result.ok, false);
  assert.ok(result.output.includes("DATABASE_URL is required"), result.output);
});

test("production refuses non-HTTPS CLIENT_ORIGIN", () => {
  const result = loadConfig({
    AUTH_MODE: "password", ADMIN_TOKEN: "a".repeat(32), METRICS_TOKEN: "b".repeat(32),
    DATABASE_URL: "postgres://x", REDIS_URL: "redis://x", CLIENT_ORIGIN: "http://example.com",
  }, "production");
  assert.equal(result.ok, false);
  assert.ok(result.output.includes("HTTPS origin"), result.output);
});

test("production accepts complete valid configuration", () => {
  const origin = "https://play.example.com";
  const result = loadConfig({
    AUTH_MODE: "password", ADMIN_TOKEN: "a".repeat(32), METRICS_TOKEN: "b".repeat(32),
    DATABASE_URL: "postgres://x", REDIS_URL: "redis://x", CLIENT_ORIGIN: origin,
    TRUST_PROXY: "true",
  }, "production");
  assert.ok(result.ok, result.output);
  assert.ok(result.output.includes('"clientOrigin":"https://play.example.com"'));
  // `TRUST_PROXY=true` resolves to a hop count of 1, never to proxy-addr's `true`, which
  // would read `request.ip` from the client-supplied left of X-Forwarded-For.
  assert.ok(result.output.includes('"trustProxy":1'), result.output);
});

test("TRUST_PROXY takes an explicit hop count and refuses anything else", () => {
  const base = { AUTH_MODE: "dev", DATABASE_URL: "", ADMIN_TOKEN: "", METRICS_TOKEN: "" };
  const twoHops = loadConfig({ ...base, TRUST_PROXY: "2" });
  assert.ok(twoHops.ok, twoHops.output);
  assert.ok(twoHops.output.includes('"trustProxy":2'), twoHops.output);
  const off = loadConfig({ ...base, TRUST_PROXY: "false" });
  assert.ok(off.output.includes('"trustProxy":false'), off.output);
  // Zero hops behind a proxy would key every limit on the proxy's own address, and a
  // stray word must not silently fall back to a permissive value either.
  assert.equal(loadConfig({ ...base, TRUST_PROXY: "0" }).ok, false);
  assert.equal(loadConfig({ ...base, TRUST_PROXY: "yes" }).ok, false);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const adminApi = readFileSync(new URL("../src/admin/api.ts", import.meta.url), "utf8");
const gameplayApi = readFileSync(new URL("../src/api.ts", import.meta.url), "utf8");
const adminApp = readFileSync(new URL("../src/admin/AdminApp.tsx", import.meta.url), "utf8");

test("admin path is selected before GameProvider and loaded lazily", () => {
  assert.match(app, /lazy\(\(\) => import\("\.\/admin\/AdminApp\.js"\)\)/);
  assert.ok(app.indexOf("window.location.pathname") < app.indexOf("<GameProvider>"));
  assert.match(app, /startsWith\("\/admin\/"\)/);
});

test("admin session and refresh cookie are isolated from gameplay API", () => {
  assert.doesNotMatch(adminApi, /from "\.\.\/api\.js"/);
  assert.match(adminApi, /admin_refresh_token|\/api\/admin\/auth\/refresh/);
  assert.doesNotMatch(adminApi, /\/api\/auth\/refresh/);
  assert.match(adminApi, /let currentSession/);
  assert.match(adminApi, /let refreshInFlight/);
  assert.doesNotMatch(adminApi, /localStorage|sessionStorage/);
});

test("admin auth transitions propagate identity and failed logout stays visible", () => {
  assert.match(adminApi, /sessionHandler\?\.\(session\)/);
  assert.match(adminApi, /withAuthCookieLock/);
  assert.match(adminApp, /api\.onSession\(setSession\)/);
  assert.match(adminApp, /setLogoutError\(message\(reason\)\)/);
  assert.match(adminApp, /disabled=\{loggingOut\}/);
  assert.doesNotMatch(adminApp, /api\.logout\(\)\.catch\(\(\) => undefined\)/);
});

test("gameplay refresh is single-flight", () => {
  assert.match(gameplayApi, /let refreshInFlight: Promise<Session>/);
  assert.match(gameplayApi, /if \(!refreshInFlight\)/);
  assert.match(gameplayApi, /refreshInFlight === pending/);
});

test("admin destructive actions use shared Modal and authoritative reload", () => {
  assert.match(adminApp, /import \{ Modal \} from "\.\.\/ui\/Modal\.js"/);
  assert.match(adminApp, /confirmation === action\.seasonId/);
  assert.match(adminApp, /\.then\(onDone\)/);
  assert.doesNotMatch(adminApp, /\b(?:alert|confirm|prompt)\s*\(/);
  assert.doesNotMatch(adminApp, /pixi|GameProvider|\/ws/);
});

test("admin console exposes bounded detail, season and attributable audit views", () => {
  assert.match(adminApi, /export const player =/);
  assert.match(adminApp, /api\.seasons\(\)/);
  assert.match(adminApp, /api\.player\(player\.id\)/);
  assert.match(adminApp, /item\.authMethod/);
  assert.match(adminApp, /item\.requestId/);
  assert.match(adminApp, /setPlayerCursor\(page\.nextCursor\)/);
});

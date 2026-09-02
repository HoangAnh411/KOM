import { defineConfig, devices } from "@playwright/test";

// The suite talks to these URLs. PLAYWRIGHT_API/PLAYWRIGHT_WEB let CI or an
// operator point at externally-run services; when BOTH are set nothing is
// auto-started. Otherwise Playwright spawns its own stack, with the API on the
// port implied by PLAYWRIGHT_API (default 3000) so a local server on 3000 can
// be left alone.
const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
const web = process.env.PLAYWRIGHT_WEB ?? "http://127.0.0.1:5173";
const external = Boolean(process.env.PLAYWRIGHT_API && process.env.PLAYWRIGHT_WEB);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results-e2e",
  timeout: 30000,
  workers: 1,
  use: { baseURL: web, trace: "retain-on-failure" },
  webServer: external
    ? []
    : [
        {
          command: "node apps/server/dist/index.js",
          url: `${api}/health`,
          timeout: 120000,
          reuseExistingServer: false,
          env: {
            PORT: String(new URL(api).port),
            ADMIN_TOKEN: "playwright-admin-token",
            AUTH_MODE: "dev",
            WORLD_EVENT_SPAWN_CHANCE: "1",
            WORLD_EVENT_TYPE: "mob_migration"
          }
        },
        {
          command: "npx vite apps/client --host 127.0.0.1",
          url: web,
          timeout: 120000,
          reuseExistingServer: false,
          env: { VITE_API_URL: api, VITE_AUTH_MODE: "dev" }
        }
      ],
  projects: [
    // Setup-only project: discards the in-memory world BEFORE the browser
    // projects run, so reset.spec never re-runs inside them.
    { name: "reset-world", testMatch: /e2e\/reset\.spec\.ts/ },
    // Phase 7C ships desktop-first; mobile viewport specs land in Phase 8.
    { name: "chromium", testIgnore: /e2e\/(reset|password-auth)\.spec\.ts/, use: { ...devices["Desktop Chrome"] }, dependencies: ["reset-world"] },
    ...(process.env.E2E_PROD_SMOKE === "1" ? [{ name: "password-auth", testMatch: /e2e\/password-auth\.spec\.ts/, use: { ...devices["Desktop Chrome"], ignoreHTTPSErrors: true } }] : [])
  ]
});

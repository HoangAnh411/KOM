import { test, expect } from "@playwright/test";

// Setup-project: discards the in-memory e2e world so each project runs against a
// fresh kingdom (dev players from previous suites are permanent seats).
test("reset the e2e world", async ({ request }) => {
  const response = await request.post(`${process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000"}/api/dev/reset`);
  expect(response.ok()).toBeTruthy();
});
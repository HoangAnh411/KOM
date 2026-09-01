import { test, expect } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

test("login, build, websocket snapshot and session restore", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kingdoms of Meridian" })).toBeVisible();
  await page.locator("input").fill(`E2E ${testInfo.project.name} ${Date.now()}`);
  await page.locator("form button").click();
  await expect(page.locator(".hud h2").first()).toBeVisible();
  await expect(page.locator(".hud")).toBeVisible();
  const buildResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await page.locator(".actions button").first().click();
  expect((await buildResponse).ok()).toBeTruthy();
  await expect(page.getByText("Build queues: 1/2")).toBeVisible();
  await page.reload();
  await expect(page.locator(".hud h2").first()).toBeVisible();
  await expect(page.getByText("Build queues: 1/2")).toBeVisible();
});

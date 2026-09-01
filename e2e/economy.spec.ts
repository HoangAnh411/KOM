import { test, expect } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

// Economy & logistics panel: harvest, build the road depot, create a market
// route, and move a caravan onto it.
test("harvest, depot, trade route and caravan flow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");
  await page.goto("/");
  await page.locator("input").fill(`Econ E2E ${testInfo.project.name} ${Date.now()}`);
  await page.locator("form button").click();
  await expect(page.locator(".hud")).toBeVisible();

  // Onboarding checklist visible (fresh dev account).
  await expect(page.getByText("Bắt đầu chiến lược gia")).toBeVisible();

  // --- Build road_depot (~12s) — harvest and trade routes require it ---
  const depotResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await page.locator(".actions button").nth(1).click();
  expect((await depotResponse).ok()).toBeTruthy();
  await expect(page.getByText("Build queues: 1/2")).toBeVisible();

  // Wait for the build to finish (duration_seconds 12) — poll the queue text.
  await expect(page.getByText("Build queues: 0/2")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".city-panel").getByText(/Trạm tiếp tế cấp 1/)).toBeVisible();

  // --- Harvest (delivers to the city warehouse) ---
  const woodBefore = await page.locator(".resource-grid strong").nth(1).textContent();
  const harvestResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/harvest"));
  await page.locator(".logistics-panel .node-row button", { hasText: "Khai thác" }).first().click();
  expect((await harvestResponse).ok()).toBeTruthy();
  await expect(page.locator(".resource-grid strong").nth(1)).not.toHaveText(woodBefore ?? "");

  // --- Create a market route (city destinations are hidden in Alpha: one city per player) ---
  const hubSelect = page.locator(".route-creator select");
  await expect(hubSelect).toHaveCount(1);
  await hubSelect.selectOption({ label: "Thương cảng Meridian" });
  const routeResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/routes"));
  await page.locator(".route-creator button", { hasText: "Lập tuyến" }).click();
  expect((await routeResponse).ok()).toBeTruthy();
  await expect(page.locator(".route-row", { hasText: "Thương cảng" })).toBeVisible();

  // --- Dispatch a caravan ---
  await page.locator(".route-row button", { hasText: "Chọn gửi hàng" }).click();
  await expect(page.locator(".cargo-editor")).toBeVisible();
  const caravanResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/caravans"));
  await page.locator(".cargo-editor button", { hasText: "Gửi caravan" }).click();
  expect((await caravanResponse).ok()).toBeTruthy();
  const caravans = page.locator(".caravan-row");
  await expect(caravans.first()).toContainText("Thương cảng");
  await expect(caravans.first()).toContainText("0%");
});
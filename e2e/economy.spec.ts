import { test, expect } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

// Economy & logistics panel: harvest, build the road depot, create a market
// route, and move a caravan onto it.
test("harvest, depot, trade route and caravan flow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(`Econ E2E ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();
  const cityPanel = page.getByRole("region", { name: "Thành phố & công trình" });
  const logisticsPanel = page.getByRole("region", { name: "Kinh tế & vận tải" });

  // Onboarding checklist visible (fresh dev account).
  await expect(page.getByText("Bắt đầu chiến lược gia")).toBeVisible();

  // --- Build road_depot (~12s) — harvest and trade routes require it ---
  const depotResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await page.getByRole("button", { name: "Xây trạm trung chuyển" }).click();
  expect((await depotResponse).ok()).toBeTruthy();
  await expect(page.getByText("Hàng đợi xây: 1/2")).toBeVisible();

  // Wait for the build to finish (duration_seconds 12) — poll the queue text.
  await expect(page.getByText("Hàng đợi xây: 0/2")).toBeVisible({ timeout: 20000 });
  await expect(cityPanel.getByText(/Trạm tiếp tế cấp 1/)).toBeVisible();

  // --- Harvest (delivers to the city warehouse) ---
  const wood = page.getByTestId("resource-wood");
  const woodBefore = await wood.textContent();
  const harvestResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/harvest"));
  await logisticsPanel.getByRole("button", { name: "Khai thác" }).first().click();
  expect((await harvestResponse).ok()).toBeTruthy();
  await expect(wood).not.toHaveText(woodBefore ?? "");

  // --- Create a market route (city destinations are hidden in Alpha: one city per player) ---
  const hubSelect = logisticsPanel.getByLabel("Điểm đến");
  await expect(hubSelect).toHaveCount(1);
  await hubSelect.selectOption({ label: "Thương cảng Meridian" });
  const routeResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/routes"));
  await logisticsPanel.getByRole("button", { name: "Lập tuyến" }).click();
  expect((await routeResponse).ok()).toBeTruthy();
  await expect(page.getByTestId("route-row").filter({ hasText: "Thương cảng" })).toBeVisible();

  // --- Dispatch a caravan ---
  await page.getByTestId("route-row").getByRole("button", { name: "Chọn gửi hàng" }).click();
  const cargoEditor = page.getByRole("group", { name: "Gửi chuyến hàng" });
  await expect(cargoEditor).toBeVisible();
  const caravanResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/caravans"));
  await cargoEditor.getByRole("button", { name: "Gửi caravan" }).click();
  expect((await caravanResponse).ok()).toBeTruthy();
  const caravans = page.getByTestId("caravan-row");
  await expect(caravans.first()).toContainText("Thương cảng");
  await expect(caravans.first()).toContainText("0%");
});

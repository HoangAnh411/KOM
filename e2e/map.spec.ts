import { test, expect } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

test("map pan, zoom and focus-my-city interaction smoke", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized viewport coordinates");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(`Map E2E ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();
  // Pixi owns the canvas element, so the test anchors on the React container it mounts into.
  const canvas = page.getByTestId("world-map").locator("canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(500);

  const initial = await canvas.screenshot({ path: "test-results-e2e/map-initial.jpg" });
  expect(initial.length).toBeGreaterThan(1000);

  // Wheel-zoom in twice (right of the HUD sidebar).
  await canvas.hover({ position: { x: 800, y: 300 } });
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(60);
  }
  const zoomed = await canvas.screenshot({ path: "test-results-e2e/map-zoomed.jpg" });
  expect(zoomed.length).toBeGreaterThan(1000);

  // Drag to pan.
  await page.mouse.move(800, 300);
  await page.mouse.down();
  await page.mouse.move(650, 370, { steps: 6 });
  await page.mouse.up();
  const panned = await canvas.screenshot({ path: "test-results-e2e/map-panned.jpg" });
  expect(panned.length).toBeGreaterThan(1000);

  // Focus button recenters on the player's city.
  await page.getByRole("button", { name: "Về thành phố của tôi" }).click();
  await page.waitForTimeout(400);
  const focused = await canvas.screenshot({ path: "test-results-e2e/map-focused.jpg" });
  expect(focused.length).toBeGreaterThan(1000);

  expect(errors).toEqual([]);
});

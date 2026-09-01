import { test, expect } from "@playwright/test";

test("map pan, zoom and focus-my-city interaction smoke", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized viewport coordinates");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.locator("input").fill(`Map E2E ${testInfo.project.name} ${Date.now()}`);
  await page.locator("form button").click();
  await expect(page.locator(".hud")).toBeVisible();
  const canvas = page.locator(".map canvas");
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
  await page.locator(".map-toolbar button").click();
  await page.waitForTimeout(400);
  const focused = await canvas.screenshot({ path: "test-results-e2e/map-focused.jpg" });
  expect(focused.length).toBeGreaterThan(1000);

  expect(errors).toEqual([]);
});
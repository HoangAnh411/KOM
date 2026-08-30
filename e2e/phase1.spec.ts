import { test, expect } from "@playwright/test";

test("login, build, websocket snapshot and session restore", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kingdoms of Meridian" })).toBeVisible();
  await page.locator("input").fill("E2E Player");
  await page.locator("form button").click();
  await expect(page.locator(".hud h2").first()).toBeVisible();
  await expect(page.locator(".hud")).toBeVisible();
  await page.locator(".actions button").first().click();
  await page.reload(); await page.waitForTimeout(1000); console.log(await page.locator("body").innerText());
  await expect(page.locator(".hud h2").first()).toBeVisible();
  await expect(page.getByText(/Build queues: 1\/2/)).toBeVisible();
});
import { test, expect } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

test("login, build, websocket snapshot and session restore", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kingdoms of Meridian" })).toBeVisible();
  await page.getByPlaceholder("Tên người chơi").fill(`E2E ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  const hud = page.getByRole("complementary", { name: "Bảng điều khiển" });
  await expect(page.getByTestId("city-name")).toBeVisible();
  await expect(hud).toBeVisible();
  const buildResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await page.getByRole("button", { name: "Xây kho" }).click();
  expect((await buildResponse).ok()).toBeTruthy();
  await expect(page.getByText("Build queues: 1/2")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("city-name")).toBeVisible();
  await expect(page.getByText("Build queues: 1/2")).toBeVisible();
});

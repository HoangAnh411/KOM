import { test, expect } from "@playwright/test";

test("production password auth smoke", async ({ page, request }) => {
  const username = "smoke_" + Date.now();
  const password = "Password123!";

  expect((await request.get("/health/live")).status()).toBe(200);
  for (const internalPath of ["/health/ready", "/metrics"]) {
    expect((await request.get(internalPath)).status()).toBe(404);
  }
  expect((await request.post("/api/dev/reset")).status()).toBe(404);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kingdoms of Meridian" })).toBeVisible();

  // AuthScreen (password mode): "Tạo tài khoản" toggles the register form, which
  // adds the faction select and renames the submit button to "Đăng ký".
  await page.getByRole("button", { name: /tạo tài khoản/i }).click().catch(() => {});
  await page.getByPlaceholder(/tên đăng nhập/i).fill(username);
  await page.getByPlaceholder(/mật khẩu/i).fill(password);
  await page.getByRole("button", { name: /^đăng ký$/i }).nth(0).click();

  // Wait for login to complete, then open the command drawer from the game dock.
  await expect(page.getByTestId("resource-wood")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Vương quốc", exact: true }).click();
  const hud = page.getByRole("complementary", { name: "Bảng điều khiển" });
  await expect(hud).toBeVisible({ timeout: 10000 });

  // Build something to verify DB and WS
  const buildResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await page.getByRole("button", { name: "Xây kho" }).click();
  expect((await buildResponse).ok()).toBeTruthy();

  // Reload should restore session via cookie
  await page.reload();
  await page.getByRole("button", { name: "Vương quốc", exact: true }).click();
  await expect(hud).toBeVisible();
});

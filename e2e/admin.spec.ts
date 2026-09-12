import { test, expect } from "@playwright/test";

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;

test.skip(!username || !password, "requires a bootstrapped PostgreSQL admin account");

test("admin login, refresh restore, moderation and attributable audit", async ({ page, request, baseURL }) => {
  test.setTimeout(60_000);
  const playerUsername = `admintarget_${Date.now()}`;
  const playerPassword = "PlayerPassword123!";
  const register = await request.post("/api/auth/register", {
    headers: { origin: new URL(baseURL!).origin },
    data: { username: playerUsername, password: playerPassword, displayName: "Admin E2E target", factionId: "meridian" }
  });
  expect(register.status()).toBe(200);
  const target = await register.json() as { player: { id: string } };

  await page.goto("/admin");
  await page.getByLabel("Tên quản trị").fill(username!);
  await page.getByLabel("Mật khẩu").fill(password!);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Trung tâm quản trị" })).toBeVisible();

  await page.getByLabel("Tìm kiếm").fill("Admin E2E target");
  await page.getByRole("button", { name: "Lọc" }).click();
  await expect(page.getByRole("button", { name: "Admin E2E target" })).toBeVisible();
  await page.getByRole("button", { name: "Khóa" }).click();
  await page.getByLabel("Lý do").fill("Playwright moderation audit");
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("banned", { exact: true })).toBeVisible();
  const auditPanel = page.getByRole("region", { name: "Lịch sử audit" });
  const auditRow = auditPanel.getByRole("row").filter({ hasText: "player.ban" }).filter({ hasText: target.player.id }).first();
  await expect(auditRow.getByText("admin_session", { exact: true })).toBeVisible();
  await expect(auditRow.getByText(target.player.id, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Trung tâm quản trị" })).toBeVisible();
});

test("season close stays disabled until current ID and reason match", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/admin");
  await page.getByLabel("Tên quản trị").fill(username!);
  await page.getByLabel("Mật khẩu").fill(password!);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.getByRole("button", { name: "Đóng mùa sớm" }).click();

  const confirm = page.getByRole("button", { name: "Xác nhận" });
  await page.getByLabel("Lý do").fill("Playwright destructive confirmation");
  await expect(confirm).toBeDisabled();
  const seasonId = await page.locator('[role="dialog"] code').textContent();
  await page.getByLabel("Mã mùa hiện tại").fill(`${seasonId}-stale`);
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Mã mùa hiện tại").fill(seasonId!);
  await expect(confirm).toBeEnabled();
});

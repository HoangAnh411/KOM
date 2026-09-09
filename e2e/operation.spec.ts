import { test, expect } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

test("start operation, choose route and control time", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop operation panel");
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill("Lan");
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await page.getByRole("button", { name: "Vương quốc", exact: true }).click();
  const panel = page.getByRole("region", { name: "Chiến dịch tác chiến" });
  await expect(panel).toBeVisible();
  const startResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/operation/start"));
  await panel.getByRole("button", { name: "Bắt đầu Biên Cương" }).click();
  expect((await startResponse).ok()).toBeTruthy();
  await expect(panel).toContainText("Chờ quyết định");
  await expect(panel).toContainText("Tuyến tiếp tế");
  const actResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/operation/act"));
  await panel.locator(".operation-decision > div").filter({ hasText: "Tuyến tiếp tế" }).getByRole("button", { name: "Chọn" }).click();
  expect((await actResponse).ok()).toBeTruthy();
  await expect(panel).toContainText("Đang diễn ra");
  const speedResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/operation/time-control"));
  await panel.getByRole("button", { name: "2x" }).click();
  expect((await speedResponse).ok()).toBeTruthy();
  await expect(panel.getByRole("button", { name: "2x" })).toHaveAttribute("aria-pressed", "true");
  const pauseResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/operation/time-control"));
  await panel.getByRole("button", { name: "Tạm dừng" }).click();
  expect((await pauseResponse).ok()).toBeTruthy();
  await expect(panel).toContainText("Đã tạm dừng");
  await expect(panel.getByRole("button", { name: "Tiếp tục" })).toBeVisible();

  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kingdoms-session")!) as { token: string });
  const bootstrap = await request.get(`${api}/api/bootstrap`, { headers: { authorization: `Bearer ${session.token}` } });
  const body = await bootstrap.json() as { snapshot: { activeOperation?: { speed: number; status: string; decisions: unknown[] } } };
  expect(body.snapshot.activeOperation?.speed).toBe(2);
  expect(body.snapshot.activeOperation?.status).toBe("PAUSED");
  expect(body.snapshot.activeOperation?.decisions).toHaveLength(1);
});

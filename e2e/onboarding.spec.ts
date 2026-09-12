import { test, expect } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

test("onboarding chapters, one recommendation and behavior evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(`Ob E2E ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await page.getByRole("button", { name: "Vương quốc", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();

  const panel = page.getByRole("region", { name: "Nhiệm vụ giới thiệu" });
  await expect(panel).toContainText("còn 8/8 bước");
  await expect(panel.getByText(/Chương \d ·/)).toHaveCount(3);
  await expect(panel.getByRole("listitem")).toHaveCount(8);
  await expect(panel.getByRole("button", { name: "Xem nội thành" })).toHaveCount(1);
  await expect(panel.getByRole("button", { name: "Bỏ qua bước này" })).toHaveCount(2);
  await expect(panel.getByRole("button", { name: "Hoàn tất bước" })).toHaveCount(0);

  // The recommendation performs the real behavior; opening the city is evidence.
  await panel.getByRole("button", { name: "Xem nội thành" }).click();
  await expect(page.getByRole("button", { name: "Quay lại bản đồ" })).toBeVisible();
  await page.getByRole("button", { name: "Quay lại bản đồ" }).click();
  await expect(panel.getByRole("listitem").filter({ hasText: "Thăm quan thành phố" })).toContainText("xong");
  await expect(panel).toContainText("còn 7/8 bước");
});

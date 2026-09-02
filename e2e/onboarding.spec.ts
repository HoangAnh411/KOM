import { test, expect } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

test("onboarding checklist, Đi tới focus and ack both player steps", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(`Ob E2E ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();

  const panel = page.getByRole("region", { name: "Nhiệm vụ giới thiệu" });
  await expect(panel).toContainText("còn 8/8 bước");

  // All eight steps listed with a focus action each.
  const steps = panel.getByRole("listitem");
  await expect(steps).toHaveCount(8);
  await expect(panel.getByRole("button", { name: "Đi tới" })).toHaveCount(8);

  // "Đi tới" on the army step scrolls the HUD so the army panel is reachable.
  await steps.filter({ hasText: "Tuyển mộ quân đội" }).getByRole("button", { name: "Đi tới" }).click();
  await expect(page.getByRole("region", { name: "Quân đội" })).toBeInViewport();

  // Ack both player-verifiable steps (city_inspected, score_viewed).
  await steps.filter({ hasText: "Thăm quan thành phố" }).getByRole("button", { name: "Hoàn tất bước" }).click();
  await expect(steps.filter({ hasText: "Thăm quan thành phố" })).toContainText("xong");
  await expect(panel).toContainText("còn 7/8 bước");

  await steps.filter({ hasText: "Xem điểm mùa" }).getByRole("button", { name: "Hoàn tất bước" }).click();
  await expect(steps.filter({ hasText: "Xem điểm mùa" })).toContainText("xong");
  await expect(panel).toContainText("còn 6/8 bước");
});

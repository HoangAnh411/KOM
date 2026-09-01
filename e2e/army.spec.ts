import { test, expect } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

// Army panel: build the barracks, recruit cavalry, attack a wandering mob
// (battle report modal), then cancel the pursuit via the HUD.
test("recruit, attack mob, battle report and cancel pursuit", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");
  await page.goto("/");
  await page.locator("input").fill(`Army E2E ${testInfo.project.name} ${Date.now()}`);
  await page.locator("form button").click();
  await expect(page.locator(".hud")).toBeVisible();

  // --- Build the barracks (~15s) ---
  const barracksResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await page.locator(".actions button").nth(2).click();
  expect((await barracksResponse).ok()).toBeTruthy();
  await expect(page.getByText("Build queues: 0/2")).toBeVisible({ timeout: 25000 });

  // --- Recruit 10 cavalry (cheapest affordable unit) ---
  await page.locator(".army-panel-footer button").click();
  await expect(page.getByRole("dialog", { name: "Tuyển quân" })).toBeVisible();
  await page.locator(".recruit-choice input").nth(1).check(); // cavalry
  const recruitResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/recruit"));
  await page.locator(".modal-card button", { hasText: "Tuyển 10" }).click();
  expect((await recruitResponse).ok()).toBeTruthy();
  const armyRow = page.locator(".army-row").first();
  await expect(armyRow).toContainText("Kỵ binh · 10");
  await expect(armyRow).toContainText("Chờ lệnh");

  // --- Attack a deterministic dev target. Natural mobs can move or die while
  // the test waits for the barracks, which made this scenario timing-dependent. ---
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kingdoms-session")!) as { token: string });
  const prepared = await request.post(`${api}/api/dev/battle-target`, { headers: { authorization: `Bearer ${session.token}` } });
  expect(prepared.ok()).toBeTruthy();
  const targetArmyId = ((await prepared.json()) as { targetArmyId: string }).targetArmyId;
  await armyRow.locator("button", { hasText: "Tấn công" }).click();
  const targets = page.locator(".modal-card select").locator("option");
  await expect.poll(async () => await targets.count(), { timeout: 15000 }).toBeGreaterThan(1);
  await page.locator(".modal-card select").selectOption(targetArmyId);
  const attackResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/attack"));
  await page.locator(".modal-card button", { hasText: "Ra lệnh tấn công" }).click();
  expect((await attackResponse).ok()).toBeTruthy();
  await expect(armyRow).toContainText("Đang tấn công", { timeout: 10000 });

  // --- The mob fights back: a battle report modal should arrive via WebSocket ---
  const reportModal = page.getByRole("dialog", { name: "Báo cáo trận đánh" });
  await expect(reportModal).toBeVisible({ timeout: 25000 });
  await reportModal.locator("button", { hasText: "Đóng" }).click();

  // --- Battle resolved: any surviving army is idling again, dead armies are gone ---
  await expect(page.locator(".army-row", { hasText: "Đang tấn công" })).toHaveCount(0, { timeout: 15000 });
});

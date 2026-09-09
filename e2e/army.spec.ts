import { test, expect } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

// Army panel: provision a v2 army through the dev fixture, attack a wandering
// mob (battle report modal), then verify the pursuit resolves through the HUD.
test("v2 army attacks mob and receives a battle report", async ({ page, request }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(`Army E2E ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await page.getByRole("button", { name: "Vương quốc", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();

  // This scenario tests orders and reports, not the training timer. The fixture
  // creates the same composition/commander shape as /army/create and keeps the
  // browser test independent from the economy-focused queue coverage.
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kingdoms-session")!) as { token: string });
  const provisioned = await request.post(`${api}/api/dev/army-v2`, { headers: { authorization: `Bearer ${session.token}` } });
  expect(provisioned.ok()).toBeTruthy();
  const armyRow = page.getByTestId("army-row").first();
  await expect(armyRow).toContainText("Bộ binh · 10");
  await expect(armyRow).toContainText("Chờ lệnh");

  // --- Attack a deterministic dev target. Natural mobs can move or die while
  // the browser is opening panels, which made this scenario timing-dependent. ---
  const prepared = await request.post(`${api}/api/dev/battle-target`, { headers: { authorization: `Bearer ${session.token}` } });
  expect(prepared.ok()).toBeTruthy();
  const targetArmyId = ((await prepared.json()) as { targetArmyId: string }).targetArmyId;
  const attackButton = armyRow.getByRole("button", { name: "Tấn công" });
  await attackButton.click();
  const attackModal = page.getByRole("dialog", { name: "Tấn công" });
  await expect(attackModal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(attackModal).toBeHidden();
  await expect(attackButton).toBeFocused();
  await attackButton.click();
  const targetSelect = attackModal.getByLabel("Mục tiêu tấn công");
  await expect.poll(async () => await targetSelect.locator("option").count(), { timeout: 15000 }).toBeGreaterThan(1);
  await targetSelect.selectOption(targetArmyId);
  const attackResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/attack"));
  await attackModal.getByRole("button", { name: "Ra lệnh tấn công" }).click();
  expect((await attackResponse).ok()).toBeTruthy();
  await expect(armyRow).toContainText("Đang tấn công", { timeout: 10000 });

  // --- The mob fights back: a battle report modal should arrive via WebSocket ---
  const reportModal = page.getByRole("dialog", { name: "Báo cáo trận đánh" });
  await expect(reportModal).toBeVisible({ timeout: 25000 });
  // Escape is not asserted here: reports queue, so a second battle can put another
  // one on screen and "gone after Escape" would be a race, not a rule. The trap
  // engaging is what this modal never had.
  await expect.poll(async () => await reportModal.evaluate(card => card.contains(document.activeElement))).toBe(true);
  await reportModal.getByRole("button", { name: "Đóng" }).click();

  // --- Battle resolved: any surviving army is idling again, dead armies are gone ---
  await expect(page.getByTestId("army-row").filter({ hasText: "Đang tấn công" })).toHaveCount(0, { timeout: 15000 });
});

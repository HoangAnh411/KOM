import { test, expect, type Page } from "@playwright/test";

// Phase 7C review coverage: the five behaviors the manual review found
// untested — double-submit dedupe, uncertain-retry, reload-pending restore,
// battle-report privacy and the treaty-break modal (focus trap/Escape).
const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";

// Each scenario starts from a fresh 2-player seed world: the city-placement
// grid caps out at ~16 cities across a whole run, which silently 500s logins
// when scenarios share one world.
test.beforeEach(async ({ request }) => {
  await request.post(`${api}/api/dev/reset`);
});

async function login(page: Page, name: string): Promise<{ token: string; player: { id: string } }> {
  await page.goto("/"); await page.locator("input").fill(name);
  const devResponse = page.waitForResponse(response => response.url().endsWith("/api/auth/dev"));
  await page.locator("form button").click();
  await devResponse;
  await expect(page.locator(".hud")).toBeVisible();
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("kingdoms-session")!) as { token: string; player: { id: string } });
}

test("double-click submits one command request (no second HTTP round-trip)", async ({ page }, testInfo) => {
  await login(page, `Double E2E ${testInfo.project.name} ${Date.now()}`);
  const buildRequests: string[] = [];
  page.on("request", request => { if (request.url().endsWith("/api/commands/build")) buildRequests.push(request.url()); });
  // Hold the first response open so the second click lands while it is in flight.
  await page.route("**/api/commands/build", async route => { await new Promise(resolve => setTimeout(resolve, 2000)); await route.continue(); });
  const button = page.locator(".actions button").first();
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(800); // both clicks resolved; a buggy client would have sent a second request by now
  expect(buildRequests).toHaveLength(1);
  await expect(page.getByText("Build queues: 1/2")).toBeVisible({ timeout: 10000 });

  // A deduped caller must share the real in-flight result. It must not receive
  // a synthetic success that clears form state when the only request fails.
  await page.locator(".drawer summary").click();
  const allianceName = page.getByLabel("Tên liên minh");
  const allianceTag = page.getByLabel("Ký hiệu liên minh");
  await allianceName.fill("Giữ nguyên khi lỗi");
  await allianceTag.fill("ERR");
  const allianceRequests: string[] = [];
  page.on("request", request => { if (request.url().endsWith("/api/commands/alliance/create")) allianceRequests.push(request.url()); });
  await page.route("**/api/commands/alliance/create", async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.abort(); });
  const createButton = page.getByRole("button", { name: "Tạo liên minh" });
  // Locator.dblclick scrolls the drawer control into view before dispatching
  // both clicks. Raw viewport coordinates silently miss controls below fold.
  await createButton.dblclick();
  await expect(page.locator(".pending-row", { hasText: "Tạo liên minh" })).toContainText("chưa xác nhận");
  expect(allianceRequests).toHaveLength(1);
  await expect(allianceName).toHaveValue("Giữ nguyên khi lỗi");
  await expect(allianceTag).toHaveValue("ERR");
});

test("a failed send downgrades to uncertain; Thử lại retries the same command id", async ({ page }, testInfo) => {
  await login(page, `Retry E2E ${testInfo.project.name} ${Date.now()}`);
  let firstCommandId: string | undefined;
  await page.route("**/api/commands/build", async route => {
    firstCommandId = (route.request().postDataJSON() as { commandId: string }).commandId;
    await route.abort();
  });
  await page.locator(".actions button").first().click();
  const row = page.locator(".pending-row", { hasText: "Xây kho" }).first();
  await expect(row).toContainText("chưa xác nhận");
  await expect(row.getByRole("button", { name: "Thử lại" })).toBeEnabled();
  await page.unroute("**/api/commands/build");
  const retryRequests: string[] = [];
  page.on("request", request => {
    if (request.url().endsWith("/api/commands/build") && (request.postDataJSON() as { commandId: string }).commandId === firstCommandId) retryRequests.push(request.url());
  });
  await page.route("**/api/commands/build", async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.continue(); });
  const retryButton = row.getByRole("button", { name: "Thử lại" });
  await retryButton.dblclick();
  await expect(page.locator(".pending-row")).toHaveCount(0);
  expect(retryRequests).toHaveLength(1);
  await expect(page.getByText("Build queues: 1/2")).toBeVisible();
});

test("a pending command survives reload as uncertain and retries with the same id", async ({ page }, testInfo) => {
  await login(page, `Reload E2E ${testInfo.project.name} ${Date.now()}`);
  let commandId: string | undefined;
  await page.route("**/api/commands/build", async route => {
    commandId = (route.request().postDataJSON() as { commandId: string }).commandId;
    await route.abort();
  });
  await page.locator(".actions button").first().click();
  await expect(page.locator(".pending-row", { hasText: "Xây kho" })).toContainText("chưa xác nhận");
  await page.reload();
  await expect(page.locator(".hud h2").first()).toBeVisible();
  // restorePending downgrades the persisted entry; the id must survive reload.
  const restored = page.locator(".pending-row", { hasText: "Xây kho" }).first();
  await expect(restored).toContainText("chưa xác nhận");
  await expect(restored.getByRole("button", { name: "Thử lại" })).toBeEnabled();
  await page.unroute("**/api/commands/build");
  const retried = page.waitForRequest(request => request.url().endsWith("/api/commands/build") && (request.postDataJSON() as { commandId: string }).commandId === commandId);
  await restored.getByRole("button", { name: "Thử lại" }).click();
  await retried;
  await expect(page.locator(".pending-row")).toHaveCount(0);
  await expect(page.getByText("Build queues: 1/2")).toBeVisible();
});

test("battle reports reach only participants, not a spectator", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const attackerPage = await browser.newPage();
  const spectatorPage = await browser.newPage();
  const attacker = `Battle Attacker ${testInfo.project.name} ${Date.now()}`;
  const spectator = `Battle Spectator ${testInfo.project.name} ${Date.now()}`;
  const attackerSession = await login(attackerPage, attacker);
  await login(spectatorPage, spectator);

  // --- Attacker: barracks, infantry, mob assault (same flow as army.spec) ---
  const barracksResponse = attackerPage.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await attackerPage.locator(".actions button").nth(2).click();
  expect((await barracksResponse).ok()).toBeTruthy();
  await expect(attackerPage.getByText("Build queues: 0/2")).toBeVisible({ timeout: 25000 });
  await attackerPage.locator(".army-panel-footer button").click();
  await attackerPage.locator(".recruit-choice input").nth(0).check();
  const recruitResponse = attackerPage.waitForResponse(response => response.url().endsWith("/api/commands/recruit"));
  await attackerPage.locator(".modal-card button", { hasText: "Tuyển 10" }).click();
  expect((await recruitResponse).ok()).toBeTruthy();
  await expect(attackerPage.locator(".army-row").first()).toContainText("Bộ binh · 10");
  const prepared = await attackerPage.request.post(`${api}/api/dev/battle-target`, { headers: { authorization: `Bearer ${attackerSession.token}` } });
  expect(prepared.ok()).toBeTruthy();
  const targetArmyId = ((await prepared.json()) as { targetArmyId: string }).targetArmyId;
  await attackerPage.locator(".army-row").first().locator("button", { hasText: "Tấn công" }).click();
  const targets = attackerPage.locator(".modal-card select").locator("option");
  await expect.poll(async () => await targets.count(), { timeout: 15000 }).toBeGreaterThan(1);
  await attackerPage.locator(".modal-card select").selectOption(targetArmyId);
  const attackResponse = attackerPage.waitForResponse(response => response.url().endsWith("/api/commands/attack"));
  await attackerPage.locator(".modal-card button", { hasText: "Ra lệnh tấn công" }).click();
  expect((await attackResponse).ok()).toBeTruthy();

  // --- The report lands on the participant… ---
  await expect(attackerPage.getByRole("dialog", { name: "Báo cáo trận đánh" })).toBeVisible({ timeout: 25000 });
  // --- …and never reaches the spectator, who is connected to the same world. ---
  await expect(spectatorPage.getByRole("dialog", { name: "Báo cáo trận đánh" })).toHaveCount(0);
});

test("treaty break modal traps focus, Escape cancels, destructive confirms −150", async ({ page, request }, testInfo) => {
  const me = await login(page, `Treaty E2E ${testInfo.project.name} ${Date.now()}`);
  const partnerLogin = await request.post(`${api}/api/auth/dev`, { data: { displayName: `Treaty Partner ${testInfo.project.name} ${Date.now()}`, factionId: "bastion" } });
  expect(partnerLogin.ok()).toBeTruthy();
  const partner = (await partnerLogin.json()) as { token: string; player: { id: string } };
  const propose = await request.post(`${api}/api/commands/treaty/propose`, { headers: { authorization: `Bearer ${partner.token}` }, data: { commandId: crypto.randomUUID(), targetPlayerId: me.player.id, treatyType: "non_aggression" } });
  expect(propose.ok()).toBeTruthy();

  await page.locator(".drawer summary").click();
  const pendingRow = page.locator(".treaty-pending .treaty-row").first();
  await expect(pendingRow).toContainText("đề nghị non_aggression");
  const acceptResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/treaty/respond"));
  await pendingRow.getByRole("button", { name: "Chấp nhận" }).click();
  expect((await acceptResponse).ok()).toBeTruthy();

  const activeRow = page.locator(".treaty-active .treaty-row").first();
  await expect(activeRow).toContainText("non_aggression");
  await activeRow.getByRole("button", { name: "Phá hiệp ước" }).click();

  const modal = page.getByRole("dialog", { name: "Xóa hiệp ước" });
  await expect(modal).toBeVisible();
  await expect(page.locator(".modal-card .close-focus-default")).toBeFocused();
  await expect(modal).toContainText("Trừ 150 điểm danh tiếng");

  // Tab cycles inside the card and never leaks to the page behind it.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => Boolean(document.activeElement?.closest(".modal-card")));
    expect(inside).toBeTruthy();
  }

  // Escape cancels without breaking the treaty.
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(activeRow).toBeVisible();

  // Re-open and confirm: the request goes out and the row disappears.
  await activeRow.getByRole("button", { name: "Phá hiệp ước" }).click();
  await expect(modal).toBeVisible();
  const breakResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/treaty/break"));
  await modal.getByRole("button", { name: "Phá hiệp ước (−150 danh tiếng)" }).click();
  expect((await breakResponse).ok()).toBeTruthy();
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".treaty-active .treaty-row")).toHaveCount(0);
});

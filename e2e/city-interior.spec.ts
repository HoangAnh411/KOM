import { expect, test, type Page } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";

test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

async function login(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(name);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  // The mobile HUD intentionally reduces identity to its crest, while the
  // resource strip remains a stable authenticated readiness signal.
  await expect(page.getByTestId("resource-wood")).toBeVisible();
}

test("authored 3D city supports exact building placement, layout editing, and one-step history", async ({ page }) => {
  // The first visit decodes the complete authored GLB set before exercising the
  // interaction flow; allow cold CI machines enough time for that real load.
  test.slow();
  await login(page, `City 3D ${Date.now()}`);
  await expect(page.locator(".map canvas")).toHaveAttribute("data-world-terrain-style", "authored-3d-v2");
  await page.getByRole("button", { name: "Vương quốc" }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();
  const historyBefore = await page.evaluate(() => history.length);
  // Scoped to the city panel: the onboarding "next action" card shows a CTA
  // with the same label while city_inspected is pending, so the page-wide
  // role lookup resolves to two buttons (strict mode violation).
  await page.getByRole("region", { name: "Thành phố & công trình" }).getByRole("button", { name: "Xem nội thành" }).click();

  const cityView = page.getByTestId("city-view");
  const cityCanvas = cityView.locator("canvas[data-city-asset-set]");
  await expect(cityView).toBeVisible();
  await expect(page.locator(".situation-room-world-shell")).toHaveAttribute("aria-hidden", "true");
  await expect(cityCanvas).toHaveAttribute("data-city-asset-set", "temp-kenney-v1");
  await expect(cityCanvas).toHaveAttribute("data-city-faction", "meridian");
  await expect(cityCanvas).toHaveAttribute("data-city-grid", "hidden");
  await expect(cityView.locator(".city-view-badge")).toContainText("12×12");
  expect(await page.evaluate(() => history.length)).toBe(historyBefore + 1);

  await cityView.locator(".city-view-chip", { hasText: "Nhà kho" }).click();
  await expect(cityView).toHaveAttribute("data-city-mode", "place");
  await expect(cityView.locator(".city-view-placement-toolbar")).toContainText("Nhà kho");
  await expect(cityCanvas).toHaveAttribute("data-city-grid", "local-only");

  // Merely moving the pointer toward the confirm toolbar must not drag the
  // building ghost out of the city. Placement changes only after press/drag.
  const placementStatus = cityView.locator(".city-view-placement-toolbar .is-valid");
  const lockedPlacement = await placementStatus.textContent();
  await cityCanvas.dispatchEvent("pointermove", { pointerId: 91, pointerType: "mouse", clientX: 4, clientY: 4 });
  await expect(placementStatus).toHaveText(lockedPlacement ?? "");
  await expect(cityView.locator("[data-city-confirm-build]")).toBeEnabled();

  const buildRequest = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith("/api/commands/build"));
  await cityView.locator("[data-city-confirm-build]").click();
  const buildPayload = (await buildRequest).postDataJSON() as {
    buildingId: string;
    plotX: number;
    plotY: number;
    plotRotation: number;
  };
  expect(buildPayload).toMatchObject({ buildingId: "warehouse", plotRotation: 0 });
  expect(Number.isInteger(buildPayload.plotX)).toBe(true);
  expect(Number.isInteger(buildPayload.plotY)).toBe(true);
  await expect(cityView).toHaveAttribute("data-city-mode", "view");
  await expect(cityCanvas).toHaveAttribute("data-city-grid", "hidden");

  await cityView.getByRole("button", { name: /Sắp xếp thành/ }).click();
  await cityView.locator(".city-view-chip", { hasText: "Tòa thị chính" }).click();
  const editToolbar = cityView.locator(".city-view-edit-toolbar");
  await editToolbar.getByRole("button", { name: /Xoay/ }).click();
  await expect(editToolbar.getByRole("button", { name: /Hoàn tác/ })).toBeEnabled();

  const layoutRequest = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith("/api/commands/city-layout"));
  await editToolbar.getByRole("button", { name: "Lưu quy hoạch" }).click();
  const layoutPayload = (await layoutRequest).postDataJSON() as {
    expectedRevision: number;
    placements: Array<{ buildingId: string; rotation: number }>;
  };
  expect(layoutPayload.expectedRevision).toBe(0);
  expect(layoutPayload.placements.find(item => item.buildingId === "town_hall")?.rotation).toBe(90);

  expect(await page.evaluate(() => history.length)).toBe(historyBefore + 1);
  await cityView.getByRole("button", { name: "Quay lại bản đồ" }).click();
  await expect(cityView).toBeHidden();
  await expect(page.locator(".situation-room-world-shell")).not.toHaveAttribute("aria-hidden", "true");
});

test("wheel and pinch enter the city and zoom out returns to the world", async ({ page }) => {
  test.slow();
  await login(page, `City Zoom ${Date.now()}`);
  const worldCanvas = page.getByTestId("world-map").locator("canvas");
  await expect(worldCanvas).toHaveAttribute("data-world-assets", "ready", { timeout: 30_000 });
  const box = (await worldCanvas.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cityView = page.getByTestId("city-view");
  // Zooming over the player's city works without first selecting it.
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -1100);
  await expect(cityView).toBeVisible();
  const cityCanvas = cityView.locator("canvas[data-city-asset-set]");
  await expect(cityCanvas).toBeVisible({ timeout: 30_000 });
  await cityCanvas.dispatchEvent("wheel", { deltaY: 1200 });
  await expect(cityView).toBeHidden();
  await expect(worldCanvas).not.toHaveAttribute("data-city-transition", "entering");

  // A second entry uses the actual two-pointer handlers, then pinches outward
  // to leave. This catches stale transition flags across scene activation.
  await worldCanvas.dispatchEvent("pointerdown", { pointerId: 21, pointerType: "touch", clientX: x - 20, clientY: y });
  await worldCanvas.dispatchEvent("pointerdown", { pointerId: 22, pointerType: "touch", clientX: x + 20, clientY: y });
  await worldCanvas.dispatchEvent("pointermove", { pointerId: 21, pointerType: "touch", clientX: x - 180, clientY: y });
  await worldCanvas.dispatchEvent("pointerup", { pointerId: 21, pointerType: "touch", clientX: x - 180, clientY: y });
  await worldCanvas.dispatchEvent("pointerup", { pointerId: 22, pointerType: "touch", clientX: x + 20, clientY: y });
  await expect(cityCanvas).toBeVisible({ timeout: 30_000 });
  await cityCanvas.dispatchEvent("pointerdown", { pointerId: 31, pointerType: "touch", clientX: x - 100, clientY: y });
  await cityCanvas.dispatchEvent("pointerdown", { pointerId: 32, pointerType: "touch", clientX: x + 100, clientY: y });
  await cityCanvas.dispatchEvent("pointermove", { pointerId: 31, pointerType: "touch", clientX: x + 80, clientY: y });
  await expect(cityView).toBeHidden();
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, 5000);
  await expect.poll(async () => Number(await worldCanvas.getAttribute("data-world-zoom"))).toBeLessThan(0.04);
  await expect(cityView).toBeHidden();
});

test.describe("touch city controls", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("placement controls fit and two-pointer pinch is handled without overflow", async ({ page }) => {
    await login(page, `Touch City ${Date.now()}`);
    await page.getByRole("button", { name: "Vương quốc" }).click();
    // Same scoping as the desktop spec: the onboarding CTA shares this label.
    await page.getByRole("region", { name: "Thành phố & công trình" }).getByRole("button", { name: "Xem nội thành" }).click();

    const cityView = page.getByTestId("city-view");
    const canvas = cityView.locator("canvas[data-city-asset-set]");
    await expect(canvas).toBeVisible();
    await cityView.locator(".city-view-chip", { hasText: "Nhà kho" }).click();
    await expect(cityView.locator(".city-view-placement-toolbar")).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;
    await canvas.dispatchEvent("pointerdown", { pointerId: 11, pointerType: "touch", clientX: centerX - 30, clientY: centerY });
    await canvas.dispatchEvent("pointerdown", { pointerId: 12, pointerType: "touch", clientX: centerX + 30, clientY: centerY });
    await canvas.dispatchEvent("pointermove", { pointerId: 11, pointerType: "touch", clientX: centerX - 55, clientY: centerY });
    await canvas.dispatchEvent("pointermove", { pointerId: 12, pointerType: "touch", clientX: centerX + 55, clientY: centerY });
    await canvas.dispatchEvent("pointerup", { pointerId: 11, pointerType: "touch", clientX: centerX - 55, clientY: centerY });
    await canvas.dispatchEvent("pointerup", { pointerId: 12, pointerType: "touch", clientX: centerX + 55, clientY: centerY });

    const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(overflow.width).toBeLessThanOrEqual(overflow.viewport);
    await cityView.getByRole("button", { name: "Hủy" }).click();
    await expect(cityView).toHaveAttribute("data-city-mode", "view");
    await cityView.getByRole("button", { name: "Quay lại bản đồ" }).click();
    await expect(cityView).toBeHidden();
  });
});

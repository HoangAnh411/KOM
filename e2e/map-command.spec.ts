import { test, expect } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

// Fix 8: the map is interactive — click to select entities, issue direct move
// orders from the inspector, and the alliance form no longer uses prompt().
test("map entity selection, direct move order and prompt-free alliance form", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized map interaction");
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(`Map E2E ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();

  // --- Build the barracks and recruit infantry so the player owns an army ---
  const barracksResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await page.getByRole("button", { name: "Xây trại lính" }).click();
  expect((await barracksResponse).ok()).toBeTruthy();
  await expect(page.getByText("Hàng đợi xây: 0/2")).toBeVisible({ timeout: 25000 });
  await page.getByRole("button", { name: "Tuyển quân mới" }).click();
  const recruitModal = page.getByRole("dialog", { name: "Tuyển quân" });
  await recruitModal.getByRole("radio", { name: /^Bộ binh/ }).check();
  const recruitResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/recruit"));
  await recruitModal.getByRole("button", { name: /^Tuyển 10/ }).click();
  expect((await recruitResponse).ok()).toBeTruthy();
  await expect(page.getByTestId("army-row").first()).toContainText("Bộ binh · 10");

  // The view is focused on the player's city, and the recruited army sits on it.
  // Pixi owns the canvas element, so the test anchors on the React container.
  const canvas = page.getByTestId("world-map").locator("canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;

  // --- Click the army on the map: the inspector appears with direct orders ---
  await page.mouse.click(centerX, centerY);
  const inspector = page.getByRole("region", { name: "Lệnh cho lựa chọn" });
  // Catalog-localized unit name, not the raw unitType — the same label the
  // army panel shows.
  await expect(inspector).toContainText("Bộ binh · 10");

  // --- Direct move: order mode, then click a tile two tiles east ---
  await inspector.getByRole("button", { name: "Di chuyển" }).click();
  await expect(inspector).toContainText("Nhấp vào bản đồ");
  const moveResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/move-army"));
  // Grid delta (+2, +0) → screen delta (+56, +28) from the focused city at center.
  await page.mouse.click(centerX + 56, centerY + 28);
  expect((await moveResponse).ok()).toBeTruthy();
  const body = await (await moveResponse).json() as { result: string; snapshot: { cities: Array<{ id: string; playerId: string; x: number; y: number }>; armies: Array<{ ownerPlayerId: string; targetX?: number; targetY?: number }> } };
  expect(body.result).toBe("accepted");
  const ordered = body.snapshot.armies.find(army => army.targetX !== undefined && army.targetY !== undefined)!;
  const ownCity = body.snapshot.cities.find(city => city.playerId === ordered.ownerPlayerId)!;
  expect(ordered.targetX).toBe(ownCity.x + 2);
  expect(ordered.targetY).toBe(ownCity.y);

  // --- Alliance creation through typed inputs (no browser prompt) ---
  await page.getByTestId("advanced-drawer-toggle").click();
  const alliancePanel = page.getByRole("region", { name: "Liên minh" });
  await expect(alliancePanel).toBeVisible();
  await page.getByLabel("Tên liên minh").fill("Liên minh Bản đồ");
  await page.getByLabel("Ký hiệu liên minh").fill("MAP");
  const allianceResponse = page.waitForResponse(response => response.url().endsWith("/api/commands/alliance/create"));
  await page.getByRole("button", { name: "Tạo liên minh" }).click();
  expect((await allianceResponse).ok()).toBeTruthy();
  await expect(alliancePanel).toContainText("[MAP] Liên minh Bản đồ");
});

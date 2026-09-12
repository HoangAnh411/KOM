import { test, expect } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

// Fix 8: the map is interactive — click to select entities, issue direct move
// orders from the inspector, and the alliance form no longer uses prompt().
test("map entity selection, direct move order and prompt-free alliance form", async ({ page }, testInfo) => {
  // Includes the real GLB cold load and the barracks construction timer.
  test.slow();
  test.skip(testInfo.project.name === "mobile", "desktop-sized map interaction");
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(`Map E2E ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await page.getByRole("button", { name: "Vương quốc", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();

  // --- Provision a v2 army for the map-order scenario. Campaign coverage owns
  // the full training queue flow; this test should exercise selection and orders.
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kingdoms-session")!) as { token: string });
  const provisioned = await page.request.post(`${api}/api/dev/army-v2`, { headers: { authorization: `Bearer ${session.token}` } });
  expect(provisioned.ok()).toBeTruthy();
  await expect(page.getByTestId("army-row").first()).toContainText("Bộ binh · 10");

  // The view is focused on the player's city, and the recruited army sits on it.
  // Three.js owns the canvas element, so the test anchors on the React container.
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
  // Click clearly outside the city's hit area; the isometric Three.js camera
  // resolves the ground tile rather than relying on the old Pixi pixel formula.
  await page.mouse.click(centerX + 100, centerY + 40);
  expect((await moveResponse).ok()).toBeTruthy();
  const body = await (await moveResponse).json() as { result: string; snapshot: { cities: Array<{ id: string; playerId: string; x: number; y: number }>; armies: Array<{ ownerPlayerId: string; targetX?: number; targetY?: number }> } };
  expect(body.result).toBe("accepted");
  const ordered = body.snapshot.armies.find(army => army.targetX !== undefined && army.targetY !== undefined)!;
  const ownCity = body.snapshot.cities.find(city => city.playerId === ordered.ownerPlayerId)!;
  expect(Number.isInteger(ordered.targetX)).toBe(true);
  expect(Number.isInteger(ordered.targetY)).toBe(true);
  expect(Math.abs(ordered.targetX! - ownCity.x) + Math.abs(ordered.targetY! - ownCity.y)).toBeGreaterThan(0);

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

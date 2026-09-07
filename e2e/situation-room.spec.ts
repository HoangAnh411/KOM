import { test, expect, type Page } from "@playwright/test";

// The game scene owns the viewport. Strategic surfaces are optional HUD drawers
// layered over it; changing viewport or opening a drawer must never resize or
// remount the Pixi world.
const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";

const sizes = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "900x800", width: 900, height: 800 },
];

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/api/dev/reset`);
});

async function login(page: Page, name: string) {
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(name);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await expect(page.getByTestId("resource-wood")).toBeVisible();
  await expect(page.locator(".map canvas")).toBeVisible({ timeout: 15_000 });
}

const measure = (page: Page) => page.evaluate(() => {
  const box = (selector: string) => {
    const element = document.querySelector(selector);
    if (!element || (element as HTMLElement).hidden) return null;
    const rect = element.getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
  };
  const canvas = document.querySelector(".map canvas") as HTMLCanvasElement | null;
  const seen = canvas?.dataset.hudCanvas === "1";
  if (canvas) canvas.dataset.hudCanvas = "1";
  return {
    kingdom: box(".kingdom-column"),
    activity: box(".activity-column"),
    map: box(".map"),
    header: box(".strategic-header"),
    tray: box(".command-tray"),
    canvas: canvas ? { w: canvas.width, h: canvas.height } : null,
    seen,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
  };
});

test("every band starts as a full-screen map and reuses one canvas", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: sizes[0]!.width, height: sizes[0]!.height });
  await login(page, `Layout E2E ${testInfo.project.name} ${Date.now()}`);
  await measure(page);

  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(250);
    const view = await measure(page);
    const label = `at ${size.name}`;

    expect(view.overflowX, `horizontal page scrolling ${label}`).toBeLessThanOrEqual(0);
    expect(view.kingdom, `kingdom drawer starts closed ${label}`).toBeNull();
    expect(view.activity, `activity drawer starts closed ${label}`).toBeNull();
    expect(view.map, `map is missing ${label}`).toEqual({ x: 0, y: 0, w: size.width, h: size.height });
    expect(view.header!.w, `HUD overlay spans the viewport ${label}`).toBe(size.width);
    expect(view.tray, `context tray is missing ${label}`).not.toBeNull();
    expect(view.seen, `Pixi was remounted ${label}`).toBe(true);
    expect(view.canvas, `renderer size ${label}`).toEqual({ w: size.width, h: size.height });
  }
});

test("desktop drawers overlay the same map and can close from either control", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, `Toggle E2E ${testInfo.project.name} ${Date.now()}`);
  const kingdom = page.getByRole("button", { name: "Vương quốc", exact: true });
  const activity = page.getByRole("button", { name: "Nhiệm vụ", exact: true });
  const closed = await measure(page);

  await kingdom.click();
  await activity.click();
  await page.waitForTimeout(250);
  const both = await measure(page);
  await expect(kingdom).toHaveAttribute("aria-expanded", "true");
  await expect(activity).toHaveAttribute("aria-expanded", "true");
  expect(both.kingdom).not.toBeNull();
  expect(both.activity).not.toBeNull();
  expect(both.map).toEqual(closed.map);
  expect(both.canvas).toEqual(closed.canvas);
  expect(both.seen).toBe(true);

  await page.getByRole("button", { name: "Đóng bảng Vương quốc" }).click();
  await page.getByRole("button", { name: "Đóng bảng Nhiệm vụ" }).click();
  await page.waitForTimeout(250);
  const closedAgain = await measure(page);
  expect(closedAgain.kingdom).toBeNull();
  expect(closedAgain.activity).toBeNull();
  expect(closedAgain.map).toEqual(closed.map);
  expect(closedAgain.canvas).toEqual(closed.canvas);
});

test("compact opens one drawer at a time without shrinking the map", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await login(page, `Compact E2E ${testInfo.project.name} ${Date.now()}`);
  const kingdom = page.getByRole("button", { name: "Vương quốc", exact: true });
  const activity = page.getByRole("button", { name: "Nhiệm vụ", exact: true });
  const closed = await measure(page);

  await kingdom.click();
  await page.waitForTimeout(250);
  const withKingdom = await measure(page);
  expect(withKingdom.kingdom).not.toBeNull();
  expect(withKingdom.kingdom!.w).toBeLessThanOrEqual(380);
  expect(withKingdom.map).toEqual(closed.map);
  expect(withKingdom.canvas).toEqual(closed.canvas);

  await activity.click();
  await page.waitForTimeout(250);
  const withActivity = await measure(page);
  await expect(activity).toHaveAttribute("aria-expanded", "true");
  await expect(kingdom).toHaveAttribute("aria-expanded", "false");
  expect(withActivity.kingdom).toBeNull();
  expect(withActivity.activity).not.toBeNull();
  expect(withActivity.activity!.x + withActivity.activity!.w).toBeGreaterThanOrEqual(closed.map!.w - 16);
  expect(withActivity.activity!.x + withActivity.activity!.w).toBeLessThanOrEqual(closed.map!.w);
  expect(withActivity.map).toEqual(closed.map);
  expect(withActivity.seen).toBe(true);
});

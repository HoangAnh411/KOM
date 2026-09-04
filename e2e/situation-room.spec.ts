import { test, expect, type Page } from "@playwright/test";

// The Situation Room is a CSS grid whose tracks collapse, and a Pixi Application
// that has to survive every one of those collapses. Neither half can be checked
// without a browser: `layout.test.ts` pins the numbers and the class names, but
// only a real layout tells you whether the map stayed dominant, whether the page
// started scrolling sideways, and whether the renderer noticed that its box moved.
const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";

// The four sizes the redesign is verified at, with the surfaces each band opens
// by default — `defaultSurfaces` in `layout.ts` is the source of these.
const sizes = [
  { name: "1920x1080", width: 1920, height: 1080, activity: true },
  { name: "1440x900", width: 1440, height: 900, activity: true },
  { name: "1280x800", width: 1280, height: 800, activity: false },
  { name: "1024x768", width: 1024, height: 768, activity: false },
];

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/api/dev/reset`);
});

async function login(page: Page, name: string) {
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(name);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();
  await expect(page.locator(".map canvas")).toBeVisible();
}

/** Geometry plus a one-bit memory on the canvas: `seen` is false the first time
 *  this runs and true forever after, so a remounted Pixi Application — which
 *  brings a brand new canvas — reads as false again. */
const measure = (page: Page) => page.evaluate(() => {
  const box = (selector: string) => {
    const element = document.querySelector(selector);
    if (!element || (element as HTMLElement).hidden) return null;
    const rect = element.getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
  };
  const canvas = document.querySelector(".map canvas") as HTMLCanvasElement | null;
  const seen = canvas?.dataset.pr3 === "1";
  if (canvas) canvas.dataset.pr3 = "1";
  return {
    kingdom: box(".kingdom-column"), activity: box(".activity-column"), map: box(".map"),
    header: box(".strategic-header"), tray: box(".command-tray"),
    canvas: canvas ? { w: canvas.width, h: canvas.height } : null,
    seen, overflowX: document.documentElement.scrollWidth - window.innerWidth,
  };
});

test("every band keeps the map dominant, fits the viewport, and reuses one canvas", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: sizes[0]!.width, height: sizes[0]!.height });
  await login(page, `Layout E2E ${testInfo.project.name} ${Date.now()}`);
  await measure(page); // Plants the marker, so `seen` is meaningful from the first size on.
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    // The band change is a matchMedia event, and Pixi resizes on the next frame.
    await expect(page.getByRole("complementary", { name: "Dòng hoạt động" })).toBeVisible({ visible: size.activity });
    await page.waitForTimeout(250);
    const view = await measure(page);
    const label = `at ${size.name}`;
    // Kingdom context is strategic and holds a track in every verified band.
    expect(view.kingdom, `kingdom column ${label}`).not.toBeNull();
    expect(view.map!.w, `map must outweigh the columns ${label}`)
      .toBeGreaterThan((view.kingdom?.w ?? 0) + (view.activity?.w ?? 0));
    expect(view.overflowX, `horizontal page scrolling ${label}`).toBeLessThanOrEqual(0);
    // The header and the tray span the shell; the columns and the map share row 2.
    expect(view.header!.w, `header spans the shell ${label}`).toBe(size.width);
    expect(view.tray!.w, `tray spans the shell ${label}`).toBe(size.width);
    expect(view.map!.x, `map sits after the kingdom track ${label}`).toBe(view.kingdom!.w);
    // Crossing a breakpoint must not take the map down with it, and the renderer
    // has to end up the size of its own box — a stale renderer leaves a dead
    // strip where the map was supposed to grow.
    expect(view.seen, `Pixi was remounted ${label}`).toBe(true);
    expect(view.canvas, `renderer size ${label}`).toEqual({ w: view.map!.w, h: view.map!.h });
  }
});

test("collapsing a column widens the same map and can always be undone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, `Toggle E2E ${testInfo.project.name} ${Date.now()}`);
  const kingdom = page.getByRole("button", { name: "Vương quốc", exact: true });
  const activity = page.getByRole("button", { name: "Hoạt động", exact: true });
  const both = await measure(page);
  await expect(kingdom).toHaveAttribute("aria-expanded", "true");
  await expect(activity).toHaveAttribute("aria-expanded", "true");

  await kingdom.click();
  await page.waitForTimeout(250);
  const noKingdom = await measure(page);
  await expect(kingdom).toHaveAttribute("aria-expanded", "false");
  expect(noKingdom.kingdom, "collapsed column still occupies space").toBeNull();
  expect(noKingdom.map!.w, "map did not take over the collapsed track").toBeGreaterThan(both.map!.w);
  expect(noKingdom.seen, "Pixi was remounted by a collapse").toBe(true);
  expect(noKingdom.canvas, "renderer did not follow the collapse").toEqual({ w: noKingdom.map!.w, h: noKingdom.map!.h });

  // The toggles live in the header precisely so a collapsed surface can be
  // reopened — a control on the column itself would collapse with it.
  await kingdom.click();
  await page.waitForTimeout(250);
  const reopened = await measure(page);
  await expect(kingdom).toHaveAttribute("aria-expanded", "true");
  expect(reopened.kingdom!.w, "column came back a different width").toBe(both.kingdom!.w);
  expect(reopened.seen, "Pixi was remounted by reopening").toBe(true);
});

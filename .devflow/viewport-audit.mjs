// Multi-viewport geometry audit: at each common window size, measure the
// interactive HUD surfaces (dock, idle tray, minimap, columns, toolbar) and
// report any element-on-element overlap that would eat clicks. Also sweep the
// dock buttons at the smallest desktop size.
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push("PAGEERROR: " + String(e).split("\n")[0]));

// NOTE: no dev reset — keep the world as-is, add a fresh player on top (the
// user's world is a shared, non-reset world too).
await page.goto("http://127.0.0.1:5174/");
await page.getByPlaceholder("Tên người chơi").fill(`Viewports ${Date.now()}`);
await page.getByRole("button", { name: "Vào kingdom" }).click();
await page.getByTestId("resource-wood").waitFor();
await page.waitForFunction(() => document.querySelector('[data-world-assets]')?.getAttribute("data-world-assets") === "ready", null, { timeout: 60_000 });
await page.waitForTimeout(1200);

const sizes = [
  [1920, 1080], [1600, 900], [1536, 864], [1440, 900], [1366, 768],
  [1280, 800], [1180, 800], [1100, 800], [1024, 768], [900, 700], [800, 600],
];
const overlap = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const [w, h] of sizes) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(400);
  // open both columns so their geometry counts
  if (!(await page.locator(".kingdom-column").isVisible())) await page.locator('.header-surfaces button[data-header-tool="kingdom"], .strategic-header button[data-header-tool="kingdom"]').click().catch(() => {}).then(() => page.waitForTimeout(300));
  if (!(await page.locator(".activity-column").isVisible())) await page.locator('.header-surfaces button[data-header-tool="activity"], .strategic-header button[data-header-tool="activity"]').click().catch(() => {}).then(() => page.waitForTimeout(300));
  const g = await page.evaluate(() => {
    const box = el => { if (!el || !el.offsetParent && el?.hidden) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 }; };
    return {
      dock: box(document.querySelector(".header-surfaces")),
      trayIdle: box(document.querySelector(".command-tray--idle")),
      trayActive: box(document.querySelector(".command-tray--active")),
      minimap: box(document.querySelector(".strategic-minimap")),
      kingdomCol: box(document.querySelector(".kingdom-column")),
      activityCol: box(document.querySelector(".activity-column")),
      toolbar: box(document.querySelector(".map-toolbar")),
      dialog: Boolean(document.querySelector("[role='dialog']")),
      vw: window.innerWidth, scrollW: document.documentElement.scrollWidth,
    };
  });
  const pairs = [
    ["trayIdle", "dock"], ["trayIdle", "minimap"], ["trayIdle", "kingdomCol"], ["trayIdle", "toolbar"],
    ["dock", "minimap"], ["dock", "kingdomCol"], ["dock", "activityCol"], ["toolbar", "activityCol"], ["toolbar", "kingdomCol"],
  ].filter(([a, b]) => overlap(g[a], g[b])).map(([a, b]) => `${a}×${b}`);
  console.log(`${w}x${h}: dock=${g.dock ? Math.round(g.dock.x) + "-" + Math.round(g.dock.x + g.dock.w) : "hidden"} tray=${g.trayIdle ? Math.round(g.trayIdle.x) + "-" + Math.round(g.trayIdle.x + g.trayIdle.w) + "@y" + Math.round(g.trayIdle.y) : "hidden"} minimap=${g.minimap ? "y" + Math.round(g.minimap.y) : "hidden"}${pairs.length ? " OVERLAPS: " + pairs.join(",") : ""}${g.scrollW > g.vw ? " HSCROLL:" + g.scrollW : ""}${g.dialog ? " DIALOG-OPEN" : ""}`);
}

console.log("errors:", errors.length ? errors : "none");
await browser.close();

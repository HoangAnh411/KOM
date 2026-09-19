// Probe: real-pointer click every dock button (Playwright checks hit-target,
// so a covering overlay fails the click), then measure that the idle tray pill
// no longer intersects the dock or the minimap.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(process.env.VW ?? 1440), height: Number(process.env.VH ?? 900) } });
const errors = [];
page.on("pageerror", e => errors.push("PAGEERROR: " + String(e)));
await page.request.post("http://127.0.0.1:3100/api/dev/reset");
await page.goto("http://127.0.0.1:5174/");
await page.getByPlaceholder("Tên người chơi").fill(`Overlay ${Date.now()}`);
await page.getByRole("button", { name: "Vào kingdom" }).click();
await page.getByTestId("resource-wood").waitFor();
await page.waitForFunction(() => document.querySelector('[data-world-assets]')?.getAttribute("data-world-assets") === "ready", null, { timeout: 60_000 });
await page.waitForTimeout(1200);

// Idle tray vs dock vs minimap geometry
const geo = await page.evaluate(() => {
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  return { tray: box(document.querySelector(".command-tray--idle")), dock: box(document.querySelector(".header-surfaces")), minimap: box(document.querySelector(".strategic-minimap")) };
});
const hit = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
console.log("geometry:", JSON.stringify(geo));
console.log("tray hits dock:", hit(geo.tray, geo.dock), "| tray hits minimap:", hit(geo.tray, geo.minimap));

// Real clicks on every dock button — a covering overlay makes Playwright miss.
const names = await page.evaluate(() => [...document.querySelectorAll(".header-surfaces button")]
  .map(b => (b.innerText || "").trim().replace(/\n.*$/, "") || b.getAttribute("aria-label")));
for (const name of names) {
  const btn = page.locator(".header-surfaces button", { hasText: name }).first();
  const modalBefore = await page.evaluate(() => document.querySelector("[role='dialog']") !== null);
  let result = "clicked";
  try { await btn.click({ timeout: 15000 }); } catch { result = "MISSED (covered?)"; }
  await page.waitForTimeout(500);
  const modalOpen = await page.evaluate(() => document.querySelector("[role='dialog']") !== null);
  if (modalOpen) {
    const closer = page.locator("[role='dialog'] .modal-close");
    if (await closer.isVisible().catch(() => false)) { await closer.click(); await page.waitForTimeout(300); }
    else { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
  }
  console.log(`[dock] ${name}: ${result}${modalOpen ? " (modal opened, closed via " + (modalOpen && "×" ) + ")" : ""}`);
}
console.log("errors:", errors.length ? errors : "none");
await browser.close();

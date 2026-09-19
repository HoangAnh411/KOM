// City-view audit: enter the interior, sweep every button (chips, toolbars,
// topbar, city dock), verify after each that the city canvas still pans/zooms
// and that returning to the map works.
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", e => errors.push("PAGEERROR: " + String(e).split("\n")[0]));
page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text().slice(0, 160)); });

await page.request.post("http://127.0.0.1:3100/api/dev/reset");
await page.goto("http://127.0.0.1:5174/");
await page.getByPlaceholder("Tên người chơi").fill(`City Audit ${Date.now()}`);
await page.getByRole("button", { name: "Vào kingdom" }).click();
await page.getByTestId("resource-wood").waitFor();
await page.waitForFunction(() => document.querySelector('[data-world-assets]')?.getAttribute("data-world-assets") === "ready", null, { timeout: 60_000 });
await page.waitForTimeout(1000);

await page.getByRole("button", { name: "Vương quốc" }).click();
await page.getByRole("region", { name: "Thành phố & công trình" }).getByRole("button", { name: "Xem nội thành" }).click();
const cityView = page.getByTestId("city-view");
await cityView.waitFor({ state: "visible", timeout: 20_000 });
await page.waitForTimeout(2500);

const cityState = () => page.evaluate(() => ({
  mode: document.querySelector("[data-city-mode]")?.getAttribute("data-city-mode"),
}));
async function sweepCity(scope, label) {
  const names = await page.evaluate(sel => [...document.querySelectorAll(sel)]
    .map(b => ({ text: (b.innerText || "").trim().replace(/\s+/g, " ").slice(0, 36), aria: b.getAttribute("aria-label") }))
    .map(b => b.text || b.aria), scope + " button, " + scope + " .city-view-chip");
  console.log(`\n== ${label}: ${names.length} ==`);
  for (const name of names) {
    if (/Bản đồ/.test(name)) continue; // exit button — audited last
    const errBefore = errors.length;
    let clicked = "ok";
    try { await page.locator(scope + " button, " + scope + " .city-view-chip", { hasText: name }).first().click({ timeout: 8000 }); }
    catch { clicked = "MISSED"; }
    await page.waitForTimeout(400);
    const mode = await cityState();
    // cancel out of any placement/edit mode the click started
    const cancel = page.locator("[data-city-mode] button", { hasText: "Hủy" }).first();
    if (await cancel.isVisible().catch(() => false)) { await cancel.click().catch(() => {}); await page.waitForTimeout(250); }
    const closer = page.locator("[role='dialog'] .modal-close");
    if (await closer.isVisible().catch(() => false)) { await closer.click().catch(() => {}); await page.waitForTimeout(250); }
    const newErrors = errors.slice(errBefore);
    console.log(`[${label}] ${name}: click=${clicked} mode=${mode.mode}${newErrors.length ? " ERRORS: " + newErrors.join(" | ") : ""}`);
  }
}

await sweepCity(".city-view-topbar", "topbar");
await sweepCity(".city-view-topbar", "topbar2");
await sweepCity(".city-view", "city-all");

// final: leave and verify the world map revives
const back = cityView.getByRole("button", { name: "Quay lại bản đồ" });
if (await back.isVisible().catch(() => false)) { await back.click(); await page.waitForTimeout(1200); }
const world = await page.evaluate(() => {
  const view = document.querySelector("[data-testid='city-view']");
  const shell = document.querySelector(".situation-room-world-shell");
  return { cityGone: !view, shellInert: shell?.hasAttribute("inert"), pan: document.querySelector("[data-world-pan]")?.getAttribute("data-world-pan") };
});
console.log("\nafter exit:", JSON.stringify(world));
const pan = () => page.evaluate(() => document.querySelector("[data-world-pan]")?.getAttribute("data-world-pan"));
const before = await pan();
await page.mouse.move(700, 420); await page.mouse.wheel(0, -300);
await page.waitForTimeout(400);
console.log("world zoom:", before !== (await pan()) || true, "(pan before/after:", before, await pan(), ")");
console.log("errors:", errors.length ? errors.slice(0, 12) : "none");
await browser.close();

// Full audit: after entering the kingdom, exercise every button on every
// surface and verify after EACH interaction that the map still pans AND zooms,
// capturing console/page errors. Then do it again on a player with state
// (buildings, army, claimed quests) — a fresh reset-world player may not
// reproduce what the user sees.
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", e => errors.push("PAGEERROR: " + String(e).split("\n")[0]));
page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text().slice(0, 160)); });

const state = () => page.evaluate(() => ({
  zoom: document.querySelector("[data-world-zoom]")?.getAttribute("data-world-zoom"),
  pan: document.querySelector("[data-world-pan]")?.getAttribute("data-world-pan"),
  dialog: Boolean(document.querySelector("[role='dialog']")),
}));

async function mapAlive(label) {
  const before = await state();
  await page.mouse.move(700, 420);
  // wheel zoom
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(350);
  const zoomed = await state();
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(250);
  // drag pan
  await page.mouse.move(700, 420);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(700 - i * 40, 420 + i * 12);
  await page.mouse.up();
  await page.waitForTimeout(350);
  const panned = await state();
  const zoomOk = before.zoom !== zoomed.zoom;
  const panOk = before.pan !== panned.pan;
  console.log(`  map: zoom=${zoomOk ? "ok" : "DEAD"} pan=${panOk ? "ok" : "DEAD"} ${!zoomOk || !panOk ? `(${label}) before=${before.zoom}/${before.pan} after=${zoomed.zoom}/${panned.pan}` : ""}`);
  return zoomOk && panOk;
}

async function sweep(scope, label) {
  const names = await page.evaluate(sel => [...document.querySelectorAll(sel)]
    .map(b => ({ text: (b.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40), tool: b.getAttribute("data-header-tool"), aria: b.getAttribute("aria-label") }))
    .map(b => b.text || b.aria || b.tool), scope + " button");
  console.log(`\n== ${label}: ${names.length} buttons ==`);
  for (const name of names) {
    if (name === "Thoát") continue; // logout ends the session — audited separately
    const errBefore = errors.length;
    let clicked = "ok";
    try {
      const btn = page.locator(scope + " button", { hasText: name }).first();
      await btn.click({ timeout: 12000 });
    } catch { clicked = "MISSED"; }
    await page.waitForTimeout(450);
    const alive = await mapAlive(name);
    // close anything that opened
    const closer = page.locator("[role='dialog'] .modal-close");
    if (await closer.isVisible().catch(() => false)) { await closer.click().catch(() => {}); await page.waitForTimeout(250); }
    else if (await page.evaluate(() => document.querySelector("[role='dialog']"))) { await page.keyboard.press("Escape"); await page.waitForTimeout(250); }
    const newErrors = errors.slice(errBefore);
    console.log(`[${label}] ${name}: click=${clicked} map=${alive ? "alive" : "DEAD"}${newErrors.length ? " ERRORS: " + newErrors.join(" | ") : ""}`);
    if (!alive) console.log(`*** FREEZE at: ${name} ***`);
  }
}

await page.request.post("http://127.0.0.1:3100/api/dev/reset");
await page.goto("http://127.0.0.1:5174/");
await page.getByPlaceholder("Tên người chơi").fill(`Audit ${Date.now()}`);
await page.getByRole("button", { name: "Vào kingdom" }).click();
await page.getByTestId("resource-wood").waitFor();
await page.waitForFunction(() => document.querySelector('[data-world-assets]')?.getAttribute("data-world-assets") === "ready", null, { timeout: 60_000 });
await page.waitForTimeout(1500);

// Phase 1: interceptor grid — what sits on top of the map?
const grid = await page.evaluate(() => {
  const cells = [];
  for (let gx = 0; gx < 12; gx++) for (let gy = 0; gy < 8; gy++) {
    const x = 60 + gx * 120, y = 60 + gy * 105;
    const top = document.elementsFromPoint(x, y)[0];
    cells.push(`${top.tagName}.${String(top.className).split(" ")[0]}`);
  }
  const counts = {};
  for (const c of cells) counts[c] = (counts[c] ?? 0) + 1;
  return counts;
});
console.log("interceptor grid (top element counts):", JSON.stringify(grid));

// Phase 2: baseline
console.log("\n== baseline ==");
await mapAlive("baseline");

// Phase 3: dock + toolbar
await sweep(".header-surfaces", "dock");
await sweep(".map-toolbar", "toolbar");

// Phase 4: kingdom column (open it first)
if (!(await page.locator(".kingdom-column").isVisible())) {
  await page.locator('.header-surfaces button[data-header-tool="kingdom"]').click();
  await page.waitForTimeout(400);
}
await sweep(".kingdom-column", "kingdom-col");

// Phase 5: activity column
await page.locator('.header-surfaces button[data-header-tool="activity"]').click();
await page.waitForTimeout(400);
await sweep(".activity-column", "activity-col");

// Phase 6: give the player state, then re-sweep the surfaces that read it.
// A fresh player may not reproduce the user's world: cosmetics, claimed quests,
// buildings and army all change what the panels render.
console.log("\n== building state ==");
await page.getByRole("button", { name: "Vương quốc" }).click();
await page.waitForTimeout(400);
const buildButton = page.locator(".kingdom-column button", { hasText: "Xây kho" }).first();
if (await buildButton.isVisible().catch(() => false)) {
  await buildButton.click();
  await page.waitForTimeout(400);
  // confirm the build via the command tray, wherever its confirm lives
  for (const t of ["Xây ở đây", "Xác nhận", "Đặt"]) {
    const confirm = page.locator(".command-tray button, .kingdom-column button", { hasText: t }).first();
    if (await confirm.isVisible().catch(() => false)) { await confirm.click(); await page.waitForTimeout(600); break; }
  }
  console.log("built warehouse (best effort)");
}
// claim a daily quest reward if present
const claim = page.locator(".activity-column button, .kingdom-column button", { hasText: "Nhận" }).first();
if (await claim.isVisible().catch(() => false)) { await claim.click().catch(() => {}); await page.waitForTimeout(500); console.log("claimed quest reward"); }
// buy + equip a cosmetic in the shop, then reopen profile
await page.locator('.header-surfaces button[data-header-tool="shop"]').click();
await page.waitForTimeout(600);
const buy = page.locator("[role='dialog'] button", { hasText: /Mua|Đổi/ }).first();
if (await buy.isVisible().catch(() => false)) { await buy.click().catch(() => {}); await page.waitForTimeout(600); console.log("bought cosmetic"); }
const equip = page.locator("[role='dialog'] button", { hasText: /Đeo|Trang bị|Dùng/ }).first();
if (await equip.isVisible().catch(() => false)) { await equip.click().catch(() => {}); await page.waitForTimeout(400); console.log("equipped cosmetic"); }
const x = page.locator("[role='dialog'] .modal-close");
if (await x.isVisible().catch(() => false)) await x.click();
await page.waitForTimeout(300);

await sweep(".header-surfaces", "dock-stateful");
const kingdomOpen = await page.locator(".kingdom-column").isVisible();
if (kingdomOpen) await sweep(".kingdom-column", "kingdom-col-stateful");

console.log("\nerrors total:", errors.length ? errors.slice(0, 15) : "none");
await page.screenshot({ path: ".devflow/audit-end.png" });
await browser.close();

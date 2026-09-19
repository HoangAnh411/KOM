// Probe: click every kingdom-column and strategic-header button in turn, and
// after each interaction verify the map still pans/zooms. Reports the first
// button that leaves the map dead.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push("PAGEERROR: " + String(e)));
page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
await page.request.post("http://127.0.0.1:3100/api/dev/reset");
await page.goto("http://127.0.0.1:5174/");
await page.getByPlaceholder("Tên người chơi").fill(`Btn Scan ${Date.now()}`);
await page.getByRole("button", { name: "Vào kingdom" }).click();
await page.getByTestId("resource-wood").waitFor();
await page.waitForFunction(() => document.querySelector('[data-world-assets]')?.getAttribute("data-world-assets") === "ready", null, { timeout: 60_000 });
await page.waitForTimeout(1000);

const zoom = () => page.evaluate(() => document.querySelector("[data-world-zoom]")?.getAttribute("data-world-zoom"));
const mapAlive = async () => {
  // The map canvas only receives events when no overlay eats them; wheel on
  // the centre must change the zoom attribute if the map is live.
  const before = await zoom();
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(450);
  const after = await zoom();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(350);
  return before !== after;
};

const headerNames = ["Hồ sơ", "Sự kiện", "Đội hình", "Túi", "Shop", "Liên minh", "Báo cáo", "Menu", "Nhiệm vụ"];
for (const name of headerNames) {
  const btn = page.getByRole("button", { name, exact: true }).first();
  if (!(await btn.isVisible().catch(() => false))) { console.log(`[header] ${name}: not visible`); continue; }
  await btn.click();
  await page.waitForTimeout(600);
  const alive = await mapAlive();
  console.log(`[header] ${name} -> map ${alive ? "alive" : "DEAD"}`);
  // Dismiss whatever opened: Escape, then any close button.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const closers = page.getByRole("button", { name: /Đóng|đóng|×/ }).first();
  if (await closers.isVisible().catch(() => false)) { await closers.click().catch(() => undefined); await page.waitForTimeout(250); }
  if (!alive || errors.length) break;
}

if (!errors.length) {
  // The kingdom column: keep it open, click its buttons one by one.
  const column = page.locator(".kingdom-column");
  if (!(await column.isVisible())) {
    await page.getByRole("button", { name: "Vương quốc" }).click();
    await page.waitForTimeout(400);
  }
  const labels = await column.getByRole("button").allInnerTexts();
  const ariaLabels = await Promise.all((await column.getByRole("button").all()).map(b => b.getAttribute("aria-label")));
  const names = labels.map((l, i) => (l || ariaLabels[i] || "").trim()).filter(Boolean);
  console.log("column buttons:", names.length);
  for (const name of names) {
    if (/Xem nội thành|Đóng bảng/.test(name)) continue; // known transitions
    const btn = column.getByRole("button", { name, exact: true }).first();
    if (!(await btn.isVisible().catch(() => false))) continue;
    await btn.click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const alive = await mapAlive();
    console.log(`[column] ${name.slice(0, 34)} -> map ${alive ? "alive" : "DEAD"}`);
    if (!alive || errors.length) break;
  }
}
console.log("errors:", errors.length ? errors.slice(0, 10) : "none");
await browser.close();

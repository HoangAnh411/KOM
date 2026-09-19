// Probe: force-click every bottom-dock button (the tray pill overlays some of
// them, so we dispatch the click directly), then check: does a modal open, can
// it be closed, and does the map still pan/zoom afterwards?
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push("PAGEERROR: " + String(e)));
page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
await page.request.post("http://127.0.0.1:3100/api/dev/reset");
await page.goto("http://127.0.0.1:5174/");
await page.getByPlaceholder("Tên người chơi").fill(`Dock Probe ${Date.now()}`);
await page.getByRole("button", { name: "Vào kingdom" }).click();
await page.getByTestId("resource-wood").waitFor();
await page.waitForFunction(() => document.querySelector('[data-world-assets]')?.getAttribute("data-world-assets") === "ready", null, { timeout: 60_000 });
await page.waitForTimeout(1200);

const zoom = () => page.evaluate(() => document.querySelector("[data-world-zoom]")?.getAttribute("data-world-zoom"));
const mapAlive = async () => {
  const before = await zoom();
  await page.mouse.move(720, 400);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(400);
  const after = await zoom();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  return before !== after;
};
const clickCenter = async sel => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return false;
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return true;
}, sel);

const dockButtons = await page.evaluate(() =>
  [...document.querySelectorAll(".header-surfaces button")].map(b => ({
    text: (b.innerText || "").trim().replace(/\n.*$/, ""),
    tool: b.getAttribute("data-header-tool") ?? b.className,
  })));
console.log("dock buttons:", JSON.stringify(dockButtons));

for (const btn of dockButtons) {
  const sel = `.header-surfaces button:nth-of-type(${dockButtons.indexOf(btn) + 1})`;
  const clicked = await clickCenter(sel);
  await page.waitForTimeout(700);
  const modal = await page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog'], .player-hub, .modal, [data-testid='player-hub']");
    return dialog ? (dialog.getAttribute("aria-label") || dialog.className).slice(0, 60) : null;
  });
  let alive = await mapAlive();
  console.log(`[${btn.text || btn.tool}] clicked=${clicked} modal=${modal ?? "none"} map=${alive ? "alive" : "DEAD"}`);
  if (!alive) { console.log("FREEZE REPRODUCED at", btn.text || btn.tool); break; }
  // close: Escape then close buttons
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    for (const b of document.querySelectorAll("[aria-label*='Đóng'], button[aria-label*='đóng']")) {
      if (b.offsetParent) { b.dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
    }
  });
  await page.waitForTimeout(400);
  const aliveAfterClose = await mapAlive();
  if (!aliveAfterClose) { console.log(`FREEZE AFTER CLOSING ${btn.text || btn.tool}`); break; }
  console.log(`  after close: map=${aliveAfterClose ? "alive" : "DEAD"}`);
}
console.log("errors:", errors.length ? errors.slice(0, 10) : "none");
await browser.close();

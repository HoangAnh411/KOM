// Probe: open the player hub modal, then try every way of closing it and
// check whether the map revives. The freeze complaint is "opened a button,
// game frozen, cannot move anymore" — if the modal swallows input and will
// not close, that is the bug.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push("PAGEERROR: " + String(e)));
page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
await page.request.post("http://127.0.0.1:3100/api/dev/reset");
await page.goto("http://127.0.0.1:5174/");
await page.getByPlaceholder("Tên người chơi").fill(`Hub Probe ${Date.now()}`);
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
const modalOpen = () => page.evaluate(() => {
  const el = document.querySelector(".player-hub-modal, [role='dialog']");
  return el ? { label: el.getAttribute("aria-label"), visible: Boolean(el.offsetParent) } : null;
});

await page.evaluate(() => document.querySelector('.header-surfaces button[data-header-tool="profile"]').dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(800);
console.log("modal after open:", JSON.stringify(await modalOpen()), "map alive:", await mapAlive());
await page.screenshot({ path: ".devflow/hub-modal.png" });

// inventory of close affordances
const closeButtons = await page.evaluate(() => {
  const modal = document.querySelector(".player-hub-modal");
  const scope = modal ?? document;
  return [...scope.querySelectorAll("button")].map(b => ({
    label: (b.getAttribute("aria-label") || b.innerText || "").trim().slice(0, 30),
    visible: Boolean(b.offsetParent),
  })).filter(b => /đóng|close|×|Thoát|Back|lại/i.test(b.label));
});
console.log("close candidates:", JSON.stringify(closeButtons));

// 1. Escape
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
console.log("after Escape:", JSON.stringify(await modalOpen()), "map alive:", await mapAlive());
// 2. a real close button, if any
const closed = await page.evaluate(() => {
  for (const b of document.querySelectorAll(".player-hub-modal button, [role='dialog'] button")) {
    if (/đóng|×/i.test(b.getAttribute("aria-label") || b.innerText || "") && b.offsetParent) {
      b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return b.getAttribute("aria-label") || b.innerText;
    }
  }
  return null;
});
await page.waitForTimeout(500);
console.log(`after close button (${closed}):`, JSON.stringify(await modalOpen()), "map alive:", await mapAlive());
// 3. backdrop click
await page.mouse.click(720, 100);
await page.waitForTimeout(500);
console.log("after backdrop click:", JSON.stringify(await modalOpen()), "map alive:", await mapAlive());
await page.screenshot({ path: ".devflow/hub-modal-after.png" });
console.log("errors:", errors.length ? errors.slice(0, 8) : "none");
await browser.close();

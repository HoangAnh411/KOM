import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.request.post("http://127.0.0.1:3100/api/dev/reset");
await page.goto("http://127.0.0.1:5174/");
await page.getByPlaceholder("Tên người chơi").fill(`Scrim ${Date.now()}`);
await page.getByRole("button", { name: "Vào kingdom" }).click();
await page.getByTestId("resource-wood").waitFor();
await page.waitForFunction(() => document.querySelector('[data-world-assets]')?.getAttribute("data-world-assets") === "ready", null, { timeout: 60_000 });
await page.waitForTimeout(1000);
await page.locator('.header-surfaces button[data-header-tool="profile"]').click({ timeout: 15000 });
await page.waitForTimeout(600);
const result = await page.evaluate(() => {
  const probe = (x, y) => document.elementsFromPoint(x, y).map(el => `${el.tagName}.${String(el.className).split(" ")[0]}`).slice(0, 3);
  const dialog = document.querySelector("[role='dialog']");
  return {
    overDockButton: probe(250, 865),
    overTrayArea: probe(1100, 790),
    overKingdomToggle: probe(1200, 865),
    dialogVisible: Boolean(dialog?.offsetParent),
  };
});
console.log("with modal open:", JSON.stringify(result, null, 1));
// map should be inert, and closing via × should revive it
await page.locator("[role='dialog'] .modal-close").click();
await page.waitForTimeout(500);
const zoom = () => page.evaluate(() => document.querySelector("[data-world-zoom]")?.getAttribute("data-world-zoom"));
const before = await zoom();
await page.mouse.move(720, 400); await page.mouse.wheel(0, -400);
await page.waitForTimeout(500);
console.log("after ×: map zoom", before, "->", await zoom(), before !== (await zoom()) ? "(ALIVE)" : "(DEAD)");
await browser.close();

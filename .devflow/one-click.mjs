import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.request.post("http://127.0.0.1:3100/api/dev/reset");
await page.goto("http://127.0.0.1:5174/");
await page.getByPlaceholder("Tên người chơi").fill(`One ${Date.now()}`);
await page.getByRole("button", { name: "Vào kingdom" }).click();
await page.getByTestId("resource-wood").waitFor();
await page.waitForFunction(() => document.querySelector('[data-world-assets]')?.getAttribute("data-world-assets") === "ready", null, { timeout: 60_000 });
await page.waitForTimeout(1200);
const btn = page.locator('.header-surfaces button[data-header-tool="profile"]');
try {
  await btn.click({ timeout: 15000 });
  console.log("clicked OK");
} catch (e) {
  console.log("FAILED:", String(e).split("\n").slice(0, 12).join("\n"));
}
// what is at the button's center?
const at = await page.evaluate(() => {
  const b = document.querySelector('.header-surfaces button[data-header-tool="profile"]');
  const r = b.getBoundingClientRect();
  const stack = document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    .map(el => `${el.tagName}.${String(el.className).split(" ")[0]}#${el.id || ""}`);
  return { box: { x: r.x, y: r.y, w: r.width, h: r.height }, stack };
});
console.log("elementsFromPoint:", JSON.stringify(at, null, 1));
await browser.close();

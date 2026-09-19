// Probe: replicate the city-interior spec's full flow, then dump the exact
// DOM state around the final asserts — city view hidden? world shell
// aria-hidden? map alive? — to see what the spec hangs on.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push("PAGEERROR: " + String(e)));
page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
await page.request.post("http://127.0.0.1:3100/api/dev/reset");
await page.goto("http://127.0.0.1:5174/");
await page.getByPlaceholder("Tên người chơi").fill(`Full Flow ${Date.now()}`);
await page.getByRole("button", { name: "Vào kingdom" }).click();
await page.getByTestId("resource-wood").waitFor();
await page.waitForFunction(() => document.querySelector('[data-world-assets]')?.getAttribute("data-world-assets") === "ready", null, { timeout: 60_000 });
await page.waitForTimeout(800);

await page.getByRole("button", { name: "Vương quốc" }).click();
await page.getByRole("region", { name: "Thành phố & công trình" }).getByRole("button", { name: "Xem nội thành" }).click();
const cityView = page.getByTestId("city-view");
await cityView.waitFor({ state: "visible", timeout: 20_000 });
await page.waitForTimeout(2500);
console.log("city in, asset set:", await page.locator("[data-city-asset-set]").getAttribute("data-city-asset-set"));

await cityView.locator(".city-view-chip", { hasText: "Nhà kho" }).click();
await page.waitForTimeout(500);
const confirm = cityView.locator("[data-city-confirm-build]");
console.log("place mode:", await cityView.getAttribute("data-city-mode"), "confirm enabled:", await confirm.isEnabled());
await confirm.click();
await page.waitForTimeout(1200);
console.log("after build, mode:", await cityView.getAttribute("data-city-mode"));

await cityView.getByRole("button", { name: /Sắp xếp thành/ }).click();
await page.waitForTimeout(400);
await cityView.locator(".city-view-chip", { hasText: "Tòa thị chính" }).click();
await page.waitForTimeout(400);
const editToolbar = cityView.locator(".city-view-edit-toolbar");
await editToolbar.getByRole("button", { name: /Xoay/ }).click();
await page.waitForTimeout(400);
await editToolbar.getByRole("button", { name: "Lưu quy hoạch" }).click();
await page.waitForTimeout(1200);

await cityView.getByRole("button", { name: "Quay lại bản đồ" }).click();
for (const t of [300, 1000, 3000]) {
  await page.waitForTimeout(t === 300 ? 300 : t - 300 >= 0 ? t - (t === 1000 ? 300 : 1000) : 0);
  const state = await page.evaluate(() => {
    const view = document.querySelector("[data-testid='city-view']");
    const shell = document.querySelector(".situation-room-world-shell");
    return {
      cityViewPresent: Boolean(view),
      cityViewHiddenAttr: view?.getAttribute("hidden"),
      cityViewBox: view ? JSON.stringify(view.getBoundingClientRect()) : null,
      shellAriaHidden: shell?.getAttribute("aria-hidden"),
      shellInert: shell?.hasAttribute("inert"),
    };
  });
  console.log(`+${t}ms back:`, JSON.stringify(state));
}
// Is the map alive again?
const zoom = () => page.evaluate(() => document.querySelector("[data-world-zoom]")?.getAttribute("data-world-zoom"));
const before = await zoom();
await page.mouse.move(720, 450);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(500);
console.log("map zoom after return:", before, "->", await zoom(), before !== (await zoom()) ? "(ALIVE)" : "(DEAD)");
console.log("errors:", errors.length ? errors.slice(0, 10) : "none");
await browser.close();

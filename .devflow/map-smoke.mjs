import { chromium } from "@playwright/test";
// SMOKE_HEADED=1 captures with a real GPU — headless SwiftShader writes
// unreliable framebuffer colours (pure-black + pure-primary garbage), so any
// colour verification must go through headed mode.
const browser = await chromium.launch({ headless: process.env.SMOKE_HEADED !== "1" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
await page.request.post("http://127.0.0.1:3100/api/dev/reset");
await page.goto("http://127.0.0.1:5174/");
await page.getByPlaceholder("Tên người chơi").fill(`Map Look ${Date.now()}`);
await page.getByRole("button", { name: "Vào kingdom" }).click();
await page.getByTestId("resource-wood").waitFor();
// Wait for the authored terrain + props.
const canvas = page.getByTestId("world-map").locator("canvas");
await page.waitForFunction(() => document.querySelector('[data-world-assets]')?.getAttribute("data-world-assets") === "ready", null, { timeout: 60_000 });
// 1. City-level zoom (chips + dots readable).
await page.waitForTimeout(1500);
await page.screenshot({ path: ".devflow/map-near.png" });
// 2. Half zoom-out (dot labels + terrain colors).
await page.mouse.move(720, 450);
await page.mouse.wheel(0, 900);
await page.waitForTimeout(1200);
await page.screenshot({ path: ".devflow/map-mid.png" });
// 3. Far zoom (whole map wash).
await page.mouse.wheel(0, 4000);
await page.waitForTimeout(1200);
await page.screenshot({ path: ".devflow/map-far.png" });
console.log("zoom levels:", await page.evaluate(() => document.querySelector("[data-world-zoom]")?.getAttribute("data-world-zoom")));
console.log("js errors:", errors.length ? errors : "none");
await browser.close();

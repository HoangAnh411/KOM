// A/B pixel measurement: decodes two screenshots (old vs new terrain grade)
// and reports mean chroma/luma of the central region. Pure-node PNG decode
// (RGBA8, non-interlaced — exactly what Playwright writes).
import zlib from "node:zlib";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

function decodePng(buf) {
  let pos = 8, width = 0, height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let inPos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[inPos++];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = raw[inPos + x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      out[y * stride + x] = v;
    }
    inPos += stride;
  }
  return { width, height, data: out };
}

function stats(png, label) {
  const { width, height, data } = decodePng(png);
  let chromaSum = 0, lumaSum = 0, vivid = 0, n = 0;
  const x0 = Math.floor(width * 0.3), x1 = Math.floor(width * 0.7);
  const y0 = Math.floor(height * 0.3), y1 = Math.floor(height * 0.7);
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const i = (y * width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luma < 36) continue; // fog / water-edge darkness is not "mud"
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    chromaSum += chroma; lumaSum += luma; if (chroma > 48) vivid += 1; n += 1;
  }
  console.log(`${label}: mean chroma ${(chromaSum / n).toFixed(1)}, mean luma ${(lumaSum / n).toFixed(1)}, vivid ${(100 * vivid / n).toFixed(1)}%  (${n} px)`);
  return { chroma: chromaSum / n, luma: lumaSum / n, vivid };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
await page.request.post("http://127.0.0.1:3100/api/dev/reset");
await page.goto("http://127.0.0.1:5174/");
await page.getByPlaceholder("Tên người chơi").fill(`Measure ${Date.now()}`);
await page.getByRole("button", { name: "Vào kingdom" }).click();
await page.getByTestId("resource-wood").waitFor();
await page.waitForFunction(() => document.querySelector('[data-world-assets]')?.getAttribute("data-world-assets") === "ready", null, { timeout: 60_000 });
await page.waitForTimeout(1500);
const near = await page.screenshot();
await page.mouse.move(720, 450);
await page.mouse.wheel(0, 900);
await page.waitForTimeout(1200);
const mid = await page.screenshot();
await page.mouse.wheel(0, 4000);
await page.waitForTimeout(1200);
const far = await page.screenshot();
await browser.close();

console.log("--- OLD (before fragment grade) ---");
stats(readFileSync(".devflow/map-near.png"), "near"), stats(readFileSync(".devflow/map-mid.png"), "mid"), stats(readFileSync(".devflow/map-far.png"), "far");
console.log("--- NEW (fragment grade active) ---");
stats(near, "near"), stats(mid, "mid"), stats(far, "far");
console.log("js errors:", errors.length ? errors : "none");

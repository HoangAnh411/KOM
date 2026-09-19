// Detail measurement: decodes two PNGs and reports local contrast — the mean
// absolute luminance difference between horizontally adjacent pixels, and the
// share of pixels that are part of a strong edge. Colour grading barely moves
// these numbers; content (trees, rocks, roads, shadows, grain) moves them a
// lot. Pure-node PNG decode (RGBA8, non-interlaced — Playwright's writer).
import zlib from "node:zlib";
import { readFileSync } from "node:fs";

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

function detail(file, label) {
  const { width, height, data } = decodePng(readFileSync(file));
  const luma = (x, y) => {
    const i = (y * width + x) * 4;
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  };
  let gradSum = 0, strong = 0, n = 0;
  const x0 = Math.floor(width * 0.2), x1 = Math.floor(width * 0.8);
  const y0 = Math.floor(height * 0.2), y1 = Math.floor(height * 0.8);
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1 - 2; x += 2) {
    const g = Math.abs(luma(x + 2, y) - luma(x, y)) + Math.abs(luma(x, y + 2) - luma(x, y));
    gradSum += g; if (g > 36) strong += 1; n += 1;
  }
  console.log(`${label}: mean local contrast ${(gradSum / n).toFixed(1)}, strong-edge share ${(100 * strong / n).toFixed(1)}%  (${n} samples)`);
}

const [a, b] = process.argv.slice(2);
detail(a, "A");
detail(b, "B");

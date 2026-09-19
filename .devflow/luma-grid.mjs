// Coarse luma/chroma grid over a screenshot, to locate dark or washed-out
// regions without eyes on the image. Pure-node PNG decode (RGBA8).
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

const file = process.argv[2];
const cols = Number(process.argv[3] ?? 12), rows = Number(process.argv[4] ?? 8);
const { width, height, data } = decodePng(readFileSync(file));
console.log(`${file}: ${width}x${height}`);
const header = "      " + Array.from({ length: cols }, (_, c) => String(c).padStart(6)).join("");
console.log(header);
for (let row = 0; row < rows; row += 1) {
  const cells = [];
  for (let col = 0; col < cols; col += 1) {
    const x0 = Math.floor(width * col / cols), x1 = Math.floor(width * (col + 1) / cols);
    const y0 = Math.floor(height * row / rows), y1 = Math.floor(height * (row + 1) / rows);
    let lumaSum = 0, chromaSum = 0, n = 0, dark = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumaSum += luma; n += 1;
      chromaSum += Math.max(r, g, b) - Math.min(r, g, b);
      if (luma < 45) dark += 1;
    }
    cells.push(`${Math.round(lumaSum / n)}/${Math.round(chromaSum / n)}/${Math.round(100 * dark / n)}%`);
  }
  console.log(`r${row}: ` + cells.map(cell => cell.padStart(6)).join(""));
}
console.log("cell = mean luma / mean chroma / share of very dark pixels (luma<45)");

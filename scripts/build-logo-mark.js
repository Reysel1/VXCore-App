const path = require("node:path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "public", "vertex", "logo.png");
const OUTPUT = path.join(ROOT, "public", "vertex", "logo-mark.png");

const MARK = [0, 0, 0];
const TILE = [255, 255, 255];
const FAVICON = path.join(ROOT, "src", "app", "icon.png");
const GLYPH = path.join(ROOT, "public", "vertex", "logo-glyph.png");

const SIZE = 512;

const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

async function main() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    lum[i] = luminance(data[o], data[o + 1], data[o + 2]);
  }

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (lum[y * width + x] <= 128) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("No se encontró la pastilla clara en " + SOURCE);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  const outside = new Uint8Array(cw * ch);
  const queue = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= cw || y >= ch) return;
    const i = y * cw + x;
    if (outside[i]) return;
    if (lum[(y + minY) * width + (x + minX)] > 128) return;
    outside[i] = 1;
    queue.push(i);
  };

  for (let x = 0; x < cw; x++) { push(x, 0); push(x, ch - 1); }
  for (let y = 0; y < ch; y++) { push(0, y); push(cw - 1, y); }

  while (queue.length > 0) {
    const i = queue.pop();
    const x = i % cw;
    const y = (i - x) / cw;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      const l = lum[(y + minY) * width + (x + minX)];
      const o = i * 4;

      if (outside[i]) {
        const alpha = Math.max(0, Math.min(1, l / 128));
        out[o] = TILE[0]; out[o + 1] = TILE[1]; out[o + 2] = TILE[2];
        out[o + 3] = Math.round(alpha * 255);
        continue;
      }

      const t = Math.max(0, Math.min(1, l / 255));
      out[o] = Math.round(MARK[0] + (TILE[0] - MARK[0]) * t);
      out[o + 1] = Math.round(MARK[1] + (TILE[1] - MARK[1]) * t);
      out[o + 2] = Math.round(MARK[2] + (TILE[2] - MARK[2]) * t);
      out[o + 3] = 255;
    }
  }

  await sharp(out, { raw: { width: cw, height: ch, channels: 4 } })
    .resize(SIZE, SIZE, { fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toFile(OUTPUT);

  await sharp(OUTPUT).resize(108, 108, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile(FAVICON);

  const glyph = Buffer.alloc(cw * ch * 4);
  let gMinX = cw, gMinY = ch, gMaxX = -1, gMaxY = -1;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      const o = i * 4;
      const alpha = outside[i] ? 0 : 1 - Math.max(0, Math.min(1, lum[(y + minY) * width + (x + minX)] / 255));
      glyph[o] = 255; glyph[o + 1] = 255; glyph[o + 2] = 255;
      glyph[o + 3] = Math.round(alpha * 255);
      if (alpha > 0.5) {
        if (x < gMinX) gMinX = x;
        if (x > gMaxX) gMaxX = x;
        if (y < gMinY) gMinY = y;
        if (y > gMaxY) gMaxY = y;
      }
    }
  }
  if (gMaxX < 0) throw new Error("No se encontró la «V» dentro de la pastilla");

  const gw = gMaxX - gMinX + 1;
  const gh = gMaxY - gMinY + 1;
  const lado = Math.max(gw, gh);
  await sharp(glyph, { raw: { width: cw, height: ch, channels: 4 } })
    .extract({ left: gMinX, top: gMinY, width: gw, height: gh })
    .extend({
      top: Math.floor((lado - gh) / 2),
      bottom: Math.ceil((lado - gh) / 2),
      left: Math.floor((lado - gw) / 2),
      right: Math.ceil((lado - gw) / 2),
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .resize(SIZE, SIZE, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toFile(GLYPH);

  console.log(`[logo] ${path.relative(ROOT, OUTPUT)} — recorte ${cw}x${ch} → ${SIZE}x${SIZE}`);
  console.log(`[logo] ${path.relative(ROOT, FAVICON)} — 108x108`);
  console.log(`[logo] ${path.relative(ROOT, GLYPH)} — «V» ${gw}x${gh} → ${SIZE}x${SIZE}`);
}

main().catch((err) => {
  console.error("[logo]", err.message);
  process.exit(1);
});

// Makes the black background of the exercise images transparent, so the pictures sit on the
// app's neutral tile in both themes (ExerciseImage) instead of showing as a black square on the
// light theme. Near-black pixels fade out (the background and the soft shadows: from fully
// transparent at FROM to opaque at TO); the grey mannequin and the equipment stay as they were.
// Saved as 8-bit grey + alpha PNGs. Run from the repository root, after compress.mjs:
// node tools/exercise-images/transparent.mjs [--preview <out.png>] [<slug> ...]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { PNG } = createRequire(import.meta.url)('pngjs');
const FROM = 6;
const TO = 26;

const args = process.argv.slice(2);
const previewAt = args.indexOf('--preview');
const preview = previewAt >= 0 ? args.splice(previewAt, 2)[1] : null;
const dir = path.join('assets', 'exercise-images');
const files = args.length
  ? args.map((s) => `${s}.png`)
  : fs.readdirSync(dir).filter((f) => f.endsWith('.png'));

const alphaOf = (lum) => Math.round(255 * Math.min(1, Math.max(0, (lum - FROM) / (TO - FROM))));

let before = 0;
let after = 0;
const done = [];
for (const f of files) {
  const file = path.join(dir, f);
  const buf = fs.readFileSync(file);
  const src = PNG.sync.read(buf);
  const n = src.width * src.height;
  // Already done (has transparency): leave it.
  let hasAlpha = false;
  for (let i = 0; i < n && !hasAlpha; i++) hasAlpha = src.data[i * 4 + 3] < 255;
  if (hasAlpha) {
    done.push(src);
    continue;
  }
  const ga = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const r = src.data[i * 4];
    const g = src.data[i * 4 + 1];
    const b = src.data[i * 4 + 2];
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    ga[i * 2] = lum;
    ga[i * 2 + 1] = alphaOf(lum);
  }
  const out = new PNG({ width: src.width, height: src.height, colorType: 4, inputColorType: 4 });
  out.data = ga;
  const png = PNG.sync.write(out, {
    colorType: 4,
    inputColorType: 4,
    deflateLevel: 9,
    filterType: -1,
  });
  if (!preview) fs.writeFileSync(file, png);
  done.push(PNG.sync.read(png));
  before += buf.length;
  after += png.length;
}

// A sheet of the results on the light and the dark tile colours, to check them by eye.
if (preview) {
  const cell = 128;
  const cols = Math.min(8, done.length);
  const rows = Math.ceil(done.length / cols);
  const sheet = new PNG({ width: cols * cell * 2, height: rows * cell });
  const tiles = [
    [0xf1, 0xef, 0xea],
    [0x18, 0x17, 0x15],
  ];
  done.forEach((img, k) => {
    tiles.forEach((tile, t) => {
      const ox = ((k % cols) * 2 + t) * cell;
      const oy = Math.floor(k / cols) * cell;
      for (let y = 0; y < cell; y++)
        for (let x = 0; x < cell; x++) {
          const sx = Math.floor((x * img.width) / cell);
          const sy = Math.floor((y * img.height) / cell);
          const s = (sy * img.width + sx) * 4;
          const a = img.data[s + 3] / 255;
          const d = ((oy + y) * sheet.width + ox + x) * 4;
          for (let c = 0; c < 3; c++)
            sheet.data[d + c] = Math.round(img.data[s + c] * a + tile[c] * (1 - a));
          sheet.data[d + 3] = 255;
        }
    });
  });
  fs.writeFileSync(preview, PNG.sync.write(sheet));
}
console.log(
  `${files.length} images: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`,
);

// Shrinks the exercise images (they ship inside the app): the pictures are grey, so each one is
// re-saved as an 8-bit greyscale PNG with maximum compression. Same look, about a third of the size.
// Run from the repository root: node tools/exercise-images/compress.mjs [<slug> ...]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { PNG } = createRequire(import.meta.url)('pngjs');
const dir = path.join('assets', 'exercise-images');
const files = process.argv.length > 2
  ? process.argv.slice(2).map((s) => `${s}.png`)
  : fs.readdirSync(dir).filter((f) => f.endsWith('.png'));

let before = 0;
let after = 0;
for (const f of files) {
  const file = path.join(dir, f);
  const buf = fs.readFileSync(file);
  const src = PNG.sync.read(buf);
  const out = new PNG({ width: src.width, height: src.height, colorType: 0, inputColorType: 0, bitDepth: 8 });
  const grey = Buffer.alloc(src.width * src.height);
  for (let i = 0; i < grey.length; i++) {
    const r = src.data[i * 4], g = src.data[i * 4 + 1], b = src.data[i * 4 + 2];
    grey[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  out.data = grey;
  const png = PNG.sync.write(out, { colorType: 0, inputColorType: 0, deflateLevel: 9, filterType: -1 });
  if (png.length < buf.length) fs.writeFileSync(file, png);
  before += buf.length;
  after += Math.min(png.length, buf.length);
}
console.log(`${files.length} images: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);

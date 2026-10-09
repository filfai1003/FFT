// Draws the two 14 px tiles of the background grid (a faint dot and a big bright dot) as PNGs at 3x.
// The phone repeats a bitmap on the GPU, which is far cheaper than an SVG pattern. Run: node tools/make-grid-tiles.js
const fs = require('node:fs');
const { PNG } = require('pngjs');

const SPACING = 14;
const SCALE = 3;
const SUPER = 8;

function tile(radius, [r, g, b], file) {
  const size = SPACING * SCALE;
  const png = new PNG({ width: size, height: size });
  const c = size / 2;
  const rr = radius * SCALE;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < SUPER; sy++)
        for (let sx = 0; sx < SUPER; sx++) {
          const px = x + (sx + 0.5) / SUPER;
          const py = y + (sy + 0.5) / SUPER;
          if (Math.hypot(px - c, py - c) <= rr) hit++;
        }
      const i = (y * size + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = Math.round((hit / (SUPER * SUPER)) * 255);
    }
  }
  fs.writeFileSync(file, PNG.sync.write(png));
}

tile(0.75, [0x1c, 0x1c, 0x1c], 'assets/images/grid-dot@3x.png');
tile(2.4, [0x8c, 0x8c, 0x8c], 'assets/images/grid-dot-big@3x.png');

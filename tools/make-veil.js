// Draws assets/images/veil.png: black that is clear in the middle and turns opaque towards the
// edges (a soft round opening). The drifting light moves and stretches this small picture; the phone's
// GPU does that for almost nothing. Run: node tools/make-veil.js
const fs = require('node:fs');
const { PNG } = require('pngjs');

const SIZE = 512;
const png = new PNG({ width: SIZE, height: SIZE });
const c = (SIZE - 1) / 2;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    // u = 0 in the middle, 1 on the circle where the picture is fully black
    const u = Math.hypot(x - c, y - c) / (SIZE * 0.13); // 0.13 of the picture width
    const t = Math.min(1, Math.max(0, (u - 0.12) / 0.88));
    const alpha = t * t * (3 - 2 * t);
    const i = (y * SIZE + x) * 4;
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = Math.round(alpha * 255);
  }
}
fs.writeFileSync('assets/images/veil.png', PNG.sync.write(png));

// Generates catalogue exercise images with Meshy (image-to-image, style taken from the existing
// pictures) and saves them as 512x512 PNGs in assets/exercise-images/<slug>.png.
// Run from the repository root: node tools/exercise-images/generate.mjs <slug> [<slug> ...]
// Needs a signed-in Meshy CLI (npm exec meshy-cli@0.4.0 auth login). Raw 1024px outputs stay in
// tools/exercise-images/raw/ (git-ignored) for review.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ws = path.join('tools', 'exercise-images');
const prompts = JSON.parse(fs.readFileSync(path.join(ws, 'prompts.json'), 'utf8'));
const STYLE = ['assets/exercise-images/bench-press.png', 'assets/exercise-images/deadlift.png'];
const PROJECT = fs
  .readdirSync(path.join(ws, 'meshy_output'))
  .map((d) => path.join(ws, 'meshy_output', d))
  .find((d) => fs.statSync(d).isDirectory());

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function meshy(args) {
  const out = execFileSync(
    npm,
    ['exec', '--yes', '--package=meshy-cli@0.4.0', '--', 'meshy', ...args, '--output-schema', 'v1', '--format', 'json', '--no-update-check'],
    { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 1 << 26 },
  );
  const json = JSON.parse(out.slice(out.indexOf('{')));
  if (!json.ok) throw new Error(JSON.stringify(json.error));
  return json.result;
}

const prompt = (what) =>
  'Create a new image in exactly the same style as the reference images: the same smooth faceless grey ' +
  'mannequin figure with glossy chrome highlights on the working muscles, the same dark charcoal ' +
  'equipment, a pure black background, soft studio lighting, the whole figure and equipment centred ' +
  'and fully inside a square frame with some margin, anatomically correct with exactly two arms and ' +
  `two legs. The mannequin performs ${what}. Side view unless said otherwise. No text, no logos, no other people.`;

function resize(src, dst) {
  // Windows: System.Drawing, high-quality bicubic, to 512x512 PNG.
  const ps = [
    'Add-Type -AssemblyName System.Drawing',
    `$i=[System.Drawing.Image]::FromFile('${src}')`,
    '$b=New-Object System.Drawing.Bitmap 512,512',
    '$g=[System.Drawing.Graphics]::FromImage($b)',
    '$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic',
    '$g.DrawImage($i,0,0,512,512)',
    `$b.Save('${dst}',[System.Drawing.Imaging.ImageFormat]::Png)`,
    '$g.Dispose();$b.Dispose();$i.Dispose()',
  ].join(';');
  execFileSync('powershell.exe', ['-NoProfile', '-Command', ps]);
}

for (const slug of process.argv.slice(2)) {
  const what = prompts[slug];
  if (!what) throw new Error(`no prompt for ${slug}`);
  // The prompt goes through a JSON file: on Windows the npm shim would split it into words.
  const payload = path.join(ws, 'raw', `${slug}.json`);
  fs.mkdirSync(path.dirname(payload), { recursive: true });
  fs.writeFileSync(payload, JSON.stringify({ prompt: prompt(what) }));
  const created = meshy([
    'image-to-image', 'create', '--ai-model', 'nano-banana-pro',
    '--reference-image-urls', STYLE.join(','), '--data', `@${payload}`,
    '--aspect-ratio', '1:1', '--async', '--project', PROJECT, '--stage', slug, '--workspace', ws,
  ]);
  const id = created.submission.task_id;
  const done = meshy(['image-to-image', 'wait', id, '--timeout', '600', '--project', PROJECT, '--stage', slug, '--workspace', ws]);
  const outDir = path.join(ws, 'raw', slug);
  meshy(['download', '--task-json', path.join(PROJECT, `task_${id}.json`), '--kind', 'image', '--output-dir', outDir, '--workspace', ws]);
  const raw = path.join(root, outDir, fs.readdirSync(outDir).find((f) => f.endsWith('.png')));
  resize(raw, path.join(root, 'assets', 'exercise-images', `${slug}.png`));
  console.log(`${slug}\t${id}\t${done.task?.consumed_credits ?? '?'} credits`);
}

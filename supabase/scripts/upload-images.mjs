// Uploads assets/exercise-images/*.png to the public `exercise-images` bucket (service role).
// Local:  npm run db:images          (reads the keys from `supabase status`)
// Hosted: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run db:images
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'assets',
  'exercise-images',
);

let url = process.env.SUPABASE_URL;
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  const env = Object.fromEntries(
    execSync('npx supabase status -o env', { encoding: 'utf8' })
      .split('\n')
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  url = env.API_URL;
  key = env.SERVICE_ROLE_KEY;
}
if (!url || !key) throw new Error('Missing Supabase URL / service role key');

const supabase = createClient(url, key);
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.png'))) {
  const { error } = await supabase.storage
    .from('exercise-images')
    .upload(file, fs.readFileSync(path.join(dir, file)), {
      contentType: 'image/png',
      upsert: true,
      cacheControl: '31536000',
    });
  console.log(error ? `FAILED ${file}: ${error.message}` : `uploaded ${file}`);
  if (error) process.exitCode = 1;
}

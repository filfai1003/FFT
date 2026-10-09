// Publishes an APK as the public download of the install page: uploads it to the public `downloads`
// bucket (service role) and writes its address, version and size in site/config.js.
// Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… [APK_BUILD_ID=…] node supabase/scripts/publish-apk.mjs path/to/fft.apk
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const file = process.argv[2];
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!file || !url || !key) throw new Error('Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node publish-apk.mjs <apk>');

const supabase = createClient(url, key);
const bucket = 'downloads';
const limit = 300 * 1024 * 1024;
const made = await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: limit });
if (made.error && !/already exists/i.test(made.error.message)) throw made.error;
if (made.error) await supabase.storage.updateBucket(bucket, { public: true, fileSizeLimit: limit });

const body = fs.readFileSync(file);
const up = await supabase.storage.from(bucket).upload('fft.apk', body, {
  contentType: 'application/vnd.android.package-archive',
  upsert: true,
  cacheControl: '300',
});
if (up.error) throw up.error;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo.version;
const size = `${Math.round(body.length / 1024 / 1024)} MB`;
const publicUrl = `${url}/storage/v1/object/public/${bucket}/fft.apk`;
fs.writeFileSync(
  path.join(root, 'site', 'config.js'),
  `// Updated each time a new APK is published (supabase/scripts/publish-apk.mjs).\nwindow.FFT_APK = ${JSON.stringify({ url: publicUrl, version, size, build: process.env.APK_BUILD_ID ?? '' })};\n`,
);
console.log(`published ${publicUrl} (${size})`);

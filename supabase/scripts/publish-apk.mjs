// Publishes an APK as the public download of the install page: uploads it to the public `downloads`
// bucket (service role) and publishes its version and size as config.js in the same bucket (the install page reads it).
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
// The install page serves both files from its own address (see site/nginx.conf), so the url is relative.
const config = `window.FFT_APK = ${JSON.stringify({ url: '/fft.apk', version, size, build: process.env.APK_BUILD_ID ?? '' })};\n`;
const cfg = await supabase.storage.from(bucket).upload('config.js', config, {
  contentType: 'application/javascript',
  upsert: true,
  cacheControl: '60',
});
if (cfg.error) throw cfg.error;
console.log(`published ${url}/storage/v1/object/public/${bucket}/fft.apk (${size})`);

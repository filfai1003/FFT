// Decrypts a file made by backup.mjs (a database dump or a photo copy).
//   BACKUP_KEY=<64 hex> node backup/restore.mjs <file.enc> <output>
// A database dump comes out as plain SQL (it is also un-gzipped): load it into an EMPTY database
// with psql, as described in docs/DEPLOY.md ("Restore a backup"). Files are downloaded from the
// Railway bucket `backups` (any S3 client, or the Railway dashboard).
import { createDecipheriv } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: BACKUP_KEY=<hex> node backup/restore.mjs <file.enc> <output>');
  process.exit(2);
}
const key = Buffer.from(process.env.BACKUP_KEY ?? '', 'hex');
if (key.length !== 32) {
  console.error('BACKUP_KEY must be the 64 hex characters of the backup service');
  process.exit(2);
}
const data = readFileSync(input);
if (data.subarray(0, 5).toString() !== 'FFTB1') {
  console.error('not an FFT backup file');
  process.exit(1);
}
const iv = data.subarray(5, 17);
const tag = data.subarray(data.length - 16);
const decipher = createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);
let plain = Buffer.concat([decipher.update(data.subarray(17, data.length - 16)), decipher.final()]);
if (input.endsWith('.sql.gz.enc')) plain = gunzipSync(plain);
writeFileSync(output, plain);
console.log(`written ${output} (${plain.length} bytes)`);

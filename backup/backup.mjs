// Nightly backup (Railway cron service `backup`, DECISIONS 60): the database and the user photos,
// encrypted, into the Railway bucket `backups` in the EU (Amsterdam).
//   db/<time>.sql.gz.enc          the whole database (pg_dump of public, auth, storage), gzip, AES-256-GCM
//   photos/<bucket>/<path>.enc    each user photo, AES-256-GCM, copied once (photos never change)
//   deletions/latest.json.enc     the deletion log (ids of deleted accounts, DECISIONS 79)
// Kept: every daily dump for 30 days, the first dump of each month for 6 months (retention.mjs);
// photo copies whose original is gone are removed 30 days later. A failure is reported to the
// admin panel (Problems).
// Restore: backup/restore.mjs, then backup/reapply-deletions.mjs (docs/DEPLOY.md).
import { spawn } from 'node:child_process';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, statSync, unlinkSync } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import pg from 'pg';
import { dumpsToDelete } from './retention.mjs';

const env = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`missing ${name}`);
  return v;
};

const MAGIC = Buffer.from('FFTB1');
const key = Buffer.from(env('BACKUP_KEY'), 'hex');
if (key.length !== 32) throw new Error('BACKUP_KEY must be 64 hex characters (32 bytes)');

const s3 = new S3Client({
  endpoint: env('BUCKET_ENDPOINT'),
  region: process.env.BUCKET_REGION || 'auto',
  credentials: {
    accessKeyId: env('BUCKET_ACCESS_KEY_ID'),
    secretAccessKey: env('BUCKET_SECRET_ACCESS_KEY'),
  },
  forcePathStyle: process.env.BUCKET_PATH_STYLE === 'true',
});
const Bucket = env('BUCKET_NAME');

/** AES-256-GCM as a stream: MAGIC | iv (12) | ciphertext | tag (16). */
function encryptStream() {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let started = false;
  return new Transform({
    transform(chunk, _enc, done) {
      if (!started) {
        started = true;
        this.push(Buffer.concat([MAGIC, iv]));
      }
      done(null, cipher.update(chunk));
    },
    flush(done) {
      if (!started) this.push(Buffer.concat([MAGIC, iv]));
      this.push(cipher.final());
      this.push(cipher.getAuthTag());
      done();
    },
  });
}

function encryptBuffer(data) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([MAGIC, iv, cipher.update(data), cipher.final(), cipher.getAuthTag()]);
}

async function listAll(Prefix) {
  const out = [];
  let ContinuationToken;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }));
    out.push(...(r.Contents ?? []));
    ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return out;
}

async function deleteKeys(keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket,
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
      }),
    );
  }
}

// ---------------------------------------------------------------- database
async function backupDatabase(stamp) {
  const file = `/tmp/db-${stamp}.enc`;
  const dump = spawn(
    'pg_dump',
    [
      '--no-owner',
      '--no-privileges',
      '--schema=public',
      '--schema=auth',
      '--schema=storage',
      env('DATABASE_URL'),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stderr = '';
  dump.stderr.on('data', (d) => (stderr += d));
  const exited = new Promise((resolve) => dump.on('close', resolve));
  await pipeline(dump.stdout, createGzip(), encryptStream(), createWriteStream(file));
  const code = await exited;
  if (code !== 0) throw new Error(`pg_dump failed (${code}): ${stderr.slice(0, 500)}`);
  const size = statSync(file).size;
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: `db/${stamp}.sql.gz.enc`,
      Body: createReadStream(file),
      ContentLength: size,
      ContentType: 'application/octet-stream',
    }),
  );
  unlinkSync(file);
  return size;
}

/**
 * The deletion log (DECISIONS 79), apart from the dumps: the ids of the deleted accounts, so a
 * restore can delete again the accounts deleted after the dump it loads. Overwritten every night.
 */
async function backupDeletions(db) {
  const { rows } = await db.query(
    'select user_id, deleted_at from public.deleted_accounts order by deleted_at',
  );
  const body = encryptBuffer(Buffer.from(JSON.stringify(rows)));
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: 'deletions/latest.json.enc',
      Body: body,
      ContentLength: body.length,
      ContentType: 'application/octet-stream',
    }),
  );
  return rows.length;
}

// ---------------------------------------------------------------- photos
const PHOTO_BUCKETS = ['progress-photos', 'user-exercise-images'];
const storage = (path, init = {}) =>
  fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/storage/v1/${path}`, {
    ...init,
    headers: {
      apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
      authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

/** Every file of a storage bucket (folders are walked). */
async function listStorage(bucket, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await storage(`object/list/${bucket}`, {
      method: 'POST',
      body: JSON.stringify({
        prefix,
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    if (!r.ok) throw new Error(`storage list ${bucket}/${prefix}: ${r.status}`);
    const items = await r.json();
    for (const it of items) {
      const path = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id == null) files.push(...(await listStorage(bucket, path)));
      else files.push(path);
    }
    if (items.length < 1000) break;
  }
  return files;
}

async function backupPhotos() {
  const existing = new Map((await listAll('photos/')).map((o) => [o.Key, o]));
  let copied = 0;
  const alive = new Set();
  for (const bucket of PHOTO_BUCKETS) {
    for (const path of await listStorage(bucket)) {
      const Key = `photos/${bucket}/${path}.enc`;
      alive.add(Key);
      if (existing.has(Key)) continue;
      const r = await storage(
        `object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`,
      );
      if (!r.ok) throw new Error(`storage download ${bucket}/${path}: ${r.status}`);
      const body = encryptBuffer(Buffer.from(await r.arrayBuffer()));
      await s3.send(new PutObjectCommand({ Bucket, Key, Body: body, ContentLength: body.length }));
      copied++;
    }
  }
  // Copies of photos deleted in the app go 30 days after their last backup run saw them gone.
  const cutoff = Date.now() - 30 * 86_400_000;
  const gone = [...existing.values()]
    .filter((o) => !alive.has(o.Key) && new Date(o.LastModified).getTime() < cutoff)
    .map((o) => o.Key);
  if (gone.length) await deleteKeys(gone);
  return { copied, removed: gone.length, total: alive.size };
}

// ---------------------------------------------------------------- run
async function report(db, message) {
  const fp = createHash('md5')
    .update(`backup|${message.slice(0, 120)}`)
    .digest('hex');
  await db
    .query(
      `insert into public.app_errors (fingerprint, kind, message, platform) values ($1, 'backup', $2, 'server')`,
      [fp, message.slice(0, 1000)],
    )
    .catch(() => undefined);
}

async function main() {
  const db = new pg.Client({ connectionString: env('DATABASE_URL') });
  await db.connect();
  const stamp = new Date()
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/:/g, '-');
  try {
    const size = await backupDatabase(stamp);
    // Reported, but the dump and the photos still go on if it fails.
    await backupDeletions(db).catch(async (e) => {
      console.error('deletion log failed:', e);
      await report(db, `Backup of the deletion log failed: ${e?.message ?? e}`);
    });
    const old = dumpsToDelete((await listAll('db/')).map((o) => o.Key));
    if (old.length) await deleteKeys(old);
    const photos = await backupPhotos();
    const summary = `${stamp} · database ${Math.round(size / 1024)} KB · photos ${photos.total} (${photos.copied} new)`;
    await db.query(
      `insert into public.app_settings (key, value) values ('backup_last', $1)
       on conflict (key) do update set value = excluded.value, deleted_at = null`,
      [summary.slice(0, 200)],
    );
    console.log(
      `backup done: ${summary}; old dumps removed: ${old.length}; photo copies removed: ${photos.removed}`,
    );
  } catch (e) {
    console.error('backup failed:', e);
    await report(db, `Backup failed: ${e?.message ?? e}`);
    process.exitCode = 1;
  } finally {
    await db.end().catch(() => undefined);
  }
}

/** For the tests only. */
export const __encryptForTest = encryptStream;

if (process.argv[1]?.endsWith('backup.mjs')) await main();

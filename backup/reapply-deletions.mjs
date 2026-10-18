// After restoring a backup (DECISIONS 80): deletes again the accounts deleted since the dump was
// made, with their files, so a restore never brings a deleted account back.
//   DATABASE_URL=<the restored database> SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node backup/reapply-deletions.mjs <deletions.json> [more.json | ids.txt …] [--rows rows.json]
// Inputs: the deletion log from the backups bucket (deletions/latest.json.enc, decrypted with
// restore.mjs), and, if the old database can still be read, its list too
// (`psql -At -c "select user_id from public.deleted_accounts" > ids.txt`). JSON (rows with user_id,
// or plain ids) or one id per line.
// --rows: the rows deleted for good (deletions/rows.json.enc, decrypted; DECISIONS 98) are deleted
// again too; their files are queued in files_to_delete and removed by the api service (it empties
// the queue at start and every day).
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { idsOf } from './retention.mjs';

const env = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`missing ${name}`);
  return v;
};

const BUCKETS = ['progress-photos', 'user-exercise-images', 'vault-files'];

async function storage(path, init = {}) {
  return fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/storage/v1/${path}`, {
    ...init,
    headers: {
      apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
      authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
      'content-type': 'application/json',
    },
  });
}

/** Every file of one account in a bucket (files live under <account id>/…). */
async function filesOf(bucket, prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await storage(`object/list/${bucket}`, {
      method: 'POST',
      body: JSON.stringify({ prefix, limit: 1000, offset }),
    });
    if (!r.ok) throw new Error(`storage list ${bucket}/${prefix}: ${r.status}`);
    const items = await r.json();
    for (const it of items) {
      const p = `${prefix}/${it.name}`;
      if (it.id == null) out.push(...(await filesOf(bucket, p)));
      else out.push(p);
    }
    if (items.length < 1000) return out;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const r = args.indexOf('--rows');
  const rowsFile = r >= 0 ? args[r + 1] : null;
  const files = r >= 0 ? args.filter((_, i) => i !== r && i !== r + 1) : args;
  if (!files.length) {
    console.error('usage: node backup/reapply-deletions.mjs <deletions.json> [more …]');
    process.exit(2);
  }
  const ids = [...new Set(files.flatMap((f) => idsOf(readFileSync(f, 'utf8'))))];
  const db = new pg.Client({ connectionString: env('DATABASE_URL') });
  await db.connect();
  try {
    const { rows } = await db.query('select public.reapply_deletions($1::uuid[]) as n', [ids]);
    console.log(
      `${ids.length} deleted accounts in the log; ${rows[0].n} were back and are deleted again`,
    );
    if (rowsFile) {
      const list = JSON.parse(readFileSync(rowsFile, 'utf8'));
      const res = await db.query('select public.reapply_row_deletions($1::jsonb) as n', [
        JSON.stringify(list),
      ]);
      console.log(
        `${list.length} rows deleted for good in the log; ${res.rows[0].n} were back and are deleted again`,
      );
    }
  } finally {
    await db.end();
  }
  let removed = 0;
  for (const id of ids)
    for (const bucket of BUCKETS) {
      const paths = await filesOf(bucket, id);
      for (let i = 0; i < paths.length; i += 100) {
        const r = await storage(`object/${bucket}`, {
          method: 'DELETE',
          body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }),
        });
        if (!r.ok) throw new Error(`storage delete ${bucket}: ${r.status}`);
        removed += Math.min(100, paths.length - i);
      }
    }
  console.log(`${removed} files of deleted accounts removed`);
}

if (process.argv[1]?.endsWith('reapply-deletions.mjs')) await main();

// For dumps made before 2026-10-18 (pg_dump --no-owner --no-privileges): they cannot be loaded
// as they are (no grants, wrong owners). Turns such a dump (decrypted with restore.mjs) into a
// data-only script for a database whose schema was rebuilt by the services themselves (auth,
// storage and api started once on the empty database: their migrations, then ours):
//   node backup/data-only.mjs dump.sql data.sql
//   psql -U supabase_admin -v ON_ERROR_STOP=1 --single-transaction -f data.sql
// The script empties every table found in the dump and loads its rows with triggers and foreign
// key checks off (session_replication_role = replica, needs a superuser such as supabase_admin).
// The migration bookkeeping (auth.schema_migrations, storage.migrations, public.app_migrations)
// is left as the services wrote it. docs/DEPLOY.md, "Restore a backup".
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node backup/data-only.mjs <dump.sql> <data.sql>');
  process.exit(2);
}
const SKIP = new Set(['auth.schema_migrations', 'storage.migrations', 'public.app_migrations']);
const lines = readFileSync(input, 'utf8').split('\n');
const blocks = [];
const tables = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('SELECT pg_catalog.setval(')) {
    blocks.push(lines[i]);
    continue;
  }
  const m = lines[i].match(/^COPY ([a-z_]+\.[a-z_"]+) \(/);
  if (!m) continue;
  let j = i + 1;
  while (j < lines.length && lines[j] !== '\\.') j++;
  if (!SKIP.has(m[1])) {
    tables.push(m[1]);
    blocks.push(lines.slice(i, j + 1).join('\n'));
  }
  i = j;
}
writeFileSync(
  output,
  [
    'SET session_replication_role = replica;',
    `TRUNCATE ${tables.join(', ')} CASCADE;`,
    ...blocks,
    'SET session_replication_role = DEFAULT;',
    '',
  ].join('\n'),
);
console.log(`written ${output}: ${tables.length} tables`);

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Applies supabase/migrations/*.sql that were not applied yet, in file order, each in one
 * transaction. Runs at every start, so a push to main that adds a migration updates the database.
 * Waits first for Auth and Storage to have created their own schemas (our migrations use them).
 */
export async function migrate(dir, log = console.log) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  for (let attempt = 0; ; attempt++) {
    try {
      await client.connect();
      break;
    } catch (e) {
      if (attempt > 60) throw e;
      await sleep(5000);
    }
  }
  try {
    for (let attempt = 0; attempt < 90; attempt++) {
      const r = await client.query(
        "select to_regclass('auth.users') a, to_regclass('storage.objects') s",
      );
      if (r.rows[0].a && r.rows[0].s) break;
      if (attempt === 89) throw new Error('auth/storage schemas never appeared');
      await sleep(5000);
    }
    await client.query(
      'create table if not exists public.app_migrations (name text primary key, applied_at timestamptz not null default now())',
    );
    const done = new Set(
      (await client.query('select name from public.app_migrations')).rows.map((r) => r.name),
    );
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      if (done.has(file)) continue;
      log(`migration ${file}`);
      await client.query('begin');
      try {
        await client.query(readFileSync(join(dir, file), 'utf8'));
        await client.query('insert into public.app_migrations (name) values ($1)', [file]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw new Error(`migration ${file} failed: ${e.message}`);
      }
    }
    log('migrations up to date');
  } finally {
    await client.end();
  }
}

// Verifies migrations + seed + the key rules on an embedded Postgres (no Docker needed).
// Run: npm run db:verify
// The pgTAP tests in supabase/tests/database run the same checks on the real Supabase stack
// (`npm run db:test`, needs Docker).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { createApi, hashToken } from '../../server/api.js';
import { clientIp, createOAuth } from '../../server/oauth.js';
import { createApkPublisher } from '../../server/apk.js';
import { dumpsToDelete, idsOf } from '../../backup/retention.mjs';
import { maskOf, maskRows, searchableColumns } from '../../admin/privacy.js';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const supabaseDir = path.join(here, '..');

const A = 'aaaaaaaa-0000-0000-0000-00000000000a';
const B = 'bbbbbbbb-0000-0000-0000-00000000000b';
// A and B are premium (VIP); C is a free account (data online too since DECISIONS 47).
const C = 'cccccccc-0000-0000-0000-00000000000c';

let db;

async function admin() {
  await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
}

async function as(uid) {
  await admin();
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: uid, role: 'authenticated' }),
  ]);
  await db.exec('set role authenticated');
}

const one = async (sql, params) => (await db.query(sql, params)).rows[0];

/** The api service's token lookup (server/api.js pgDatabase), on this database. */
async function tokenFor(hash) {
  await admin();
  const [r] = (
    await db.query(
      `select a.user_id, a.scope, public.sync_enabled_of(a.user_id) as sync,
              public.sync_categories_of(a.user_id) as categories,
              public.vault_on_of(a.user_id) as encrypted,
              public.health_consent_of(a.user_id) as consent
       from public.api_token_access($1) a`,
      [hash],
    )
  ).rows;
  return r
    ? {
        userId: r.user_id,
        scope: r.scope,
        sync: r.sync === true,
        categories: r.categories,
        encrypted: r.encrypted === true,
        consent: r.consent !== false,
      }
    : null;
}
const count = async (sql, params) => Number((await one(sql, params)).n);

async function rejects(sql, code) {
  await assert.rejects(
    () => db.exec(sql),
    (err) => {
      assert.equal(err.code, code, `expected SQLSTATE ${code}, got ${err.code}: ${err.message}`);
      return true;
    },
  );
}

before(async () => {
  db = await PGlite.create({ extensions: { pg_trgm } });
  await db.exec(fs.readFileSync(path.join(here, 'supabase-stub.sql'), 'utf8'));

  const migrations = fs.readdirSync(path.join(supabaseDir, 'migrations')).sort();
  for (const file of migrations) {
    await db.exec(fs.readFileSync(path.join(supabaseDir, 'migrations', file), 'utf8'));
  }
  await db.exec(fs.readFileSync(path.join(supabaseDir, 'seed.sql'), 'utf8'));

  await db.exec(`
    insert into auth.users (id, instance_id, aud, role, email) values
      ('${A}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.dev'),
      ('${B}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.dev'),
      ('${C}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.dev');
    insert into public.vip_users (user_id, note) values ('${A}', 'friend'), ('${B}', 'friend');
    -- They keep a copy on the server (DECISIONS 62; accounts made later choose: see that test).
    insert into public.account_sync (user_id, enabled) values ('${A}', true), ('${B}', true), ('${C}', true);
  `);
});

describe('schema', () => {
  it('has row level security on every table in public', async () => {
    const r = await one(
      `select count(*) as n from pg_tables where schemaname = 'public' and not rowsecurity`,
    );
    assert.equal(Number(r.n), 0);
  });

  it('every table has created_at, updated_at and deleted_at', async () => {
    const r = await db.query(`
      select t.table_name
      from information_schema.tables t
      where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
        and (select count(*) from information_schema.columns c
             where c.table_schema = 'public' and c.table_name = t.table_name
               and c.column_name in ('created_at', 'updated_at', 'deleted_at')) < 3`);
    assert.deepEqual(r.rows, [], 'tables missing sync columns');
  });

  it('creates a profile and settings at sign-up', async () => {
    await admin();
    assert.equal(await count('select count(*) as n from public.profiles'), 3);
    assert.equal(await count('select count(*) as n from public.user_settings'), 3);
  });

  it('seeds at least 60 catalogue exercises with valid muscles and equipment', async () => {
    await admin();
    assert.ok(
      (await count('select count(*) as n from public.exercises where owner_id is null')) >= 60,
    );
  });
});

describe('exercise images', () => {
  it('every image_path in the seed has its PNG in assets/exercise-images', async () => {
    await admin();
    const rows = (
      await db.query('select image_path from public.exercises where image_path is not null')
    ).rows;
    assert.ok(rows.length >= 3);
    for (const { image_path } of rows) {
      assert.ok(
        fs.existsSync(path.join(supabaseDir, '..', 'assets', 'exercise-images', image_path)),
        image_path + ' is missing',
      );
    }
  });
});

describe('row level security', () => {
  before(async () => {
    await as(A);
    await db.exec(`
      insert into public.food_logs (day, meal, name, grams, kcal) values ('2026-10-08', 'lunch', 'Chicken', 150, 165);
      insert into public.body_metrics (day, weight_kg) values ('2026-10-08', 78.4);
      insert into public.exercises (name, primary_muscle, equipment, owner_id)
        values ('My cable move', 'back', 'cables', '${A}');
      insert into public.consents (type, policy_version) values ('health_data', '2026-10');
    `);
  });

  it('owner sees own rows', async () => {
    await as(A);
    assert.equal(await count('select count(*) as n from public.food_logs'), 1);
  });

  it('another user sees none of them', async () => {
    await as(B);
    assert.equal(await count('select count(*) as n from public.food_logs'), 0);
    assert.equal(await count('select count(*) as n from public.body_metrics'), 0);
    assert.equal(await count('select count(*) as n from public.profiles'), 1);
    assert.equal(
      await count(`select count(*) as n from public.exercises where name = 'My cable move'`),
      0,
    );
  });

  it("another user cannot write or update someone else's rows", async () => {
    await as(B);
    await rejects(
      `insert into public.food_logs (user_id, day, meal, name, grams, kcal)
       values ('${A}', '2026-10-08', 'dinner', 'Injected', 100, 100)`,
      '42501',
    );
    const r = await db.query(`update public.body_metrics set weight_kg = 1 returning id`);
    assert.equal(r.rows.length, 0);
  });

  it('catalogue is readable by everyone and writable by no user', async () => {
    await as(B);
    assert.ok(
      (await count('select count(*) as n from public.exercises where owner_id is null')) >= 60,
    );
    await rejects(
      `insert into public.exercises (name, primary_muscle, equipment, owner_id)
       values ('Fake', 'chest', 'barbell', null)`,
      '42501',
    );
    await rejects(
      `insert into public.foods (name, kcal_100g, source, owner_id) values ('Fake', 100, 'off', null)`,
      '42501',
    );
  });

  it('consents cannot be deleted by the user', async () => {
    await as(A);
    const r = await db.query('delete from public.consents returning id');
    assert.equal(r.rows.length, 0);
    assert.equal(await count('select count(*) as n from public.consents'), 1);
  });

  it('anonymous users see no rows', async () => {
    await admin();
    await db.exec('set role anon');
    assert.equal(await count('select count(*) as n from public.food_logs'), 0);
    assert.equal(await count('select count(*) as n from public.profiles'), 0);
    assert.equal(
      await count('select count(*) as n from public.exercises'),
      0,
      'the catalogue is for signed-in users only',
    );
  });
});

describe('domain rules', () => {
  it('Epley: 1 rep = weight, 22x9 = 28.6, 13+ reps ignored', async () => {
    await admin();
    assert.equal(Number((await one('select public.epley_1rm(100, 1) as n')).n), 100);
    assert.equal(Number((await one('select round(public.epley_1rm(22, 9), 1) as n')).n), 28.6);
    assert.equal((await one('select public.epley_1rm(100, 13) as n')).n, null);
    assert.equal((await one('select public.epley_1rm(0, 5) as n')).n, null);
  });

  it('strength groups: biceps/triceps -> arms, abs -> core, glutes -> legs', async () => {
    await admin();
    const g = (m) => one('select public.strength_group($1) as n', [m]).then((r) => r.n);
    assert.equal(await g('biceps'), 'arms');
    assert.equal(await g('triceps'), 'arms');
    assert.equal(await g('abs'), 'core');
    assert.equal(await g('glutes'), 'legs');
    assert.equal(await g('chest'), 'chest');
  });

  it('records and strength score ignore uncompleted sets and active sessions', async () => {
    await as(A);
    await db.exec(`
      insert into public.workout_sessions (id, started_at, status) values
        ('11111111-0000-0000-0000-000000000001', '2026-09-01 10:00+00', 'done'),
        ('11111111-0000-0000-0000-000000000002', '2026-09-20 10:00+00', 'done'),
        ('11111111-0000-0000-0000-000000000003', '2026-10-05 10:00+00', 'active');
      insert into public.session_sets (session_id, exercise_id, set_index, weight_kg, reps, completed_at)
      select s.session_id, e.id, s.idx, s.kg, s.reps, s.done
      from (values
        ('11111111-0000-0000-0000-000000000001'::uuid, 'bench-press', 0, 100, 1, now()),
        ('11111111-0000-0000-0000-000000000001'::uuid, 'bench-press', 1, 60, 10, now()),
        ('11111111-0000-0000-0000-000000000001'::uuid, 'bench-press', 2, 200, 1, null),
        ('11111111-0000-0000-0000-000000000002'::uuid, 'bench-press', 0, 110, 1, now()),
        ('11111111-0000-0000-0000-000000000001'::uuid, 'back-squat', 0, 100, 1, now()),
        ('11111111-0000-0000-0000-000000000002'::uuid, 'back-squat', 0, 130, 1, now()),
        ('11111111-0000-0000-0000-000000000003'::uuid, 'back-squat', 0, 300, 1, now())
      ) as s(session_id, slug, idx, kg, reps, done)
      join public.exercises e on e.slug = s.slug and e.owner_id is null;
    `);

    const bench = await one(`
      select r.actual_max_kg, r.est_1rm_kg from public.exercise_records r
      join public.exercises e on e.id = r.exercise_id where e.slug = 'bench-press'`);
    assert.equal(Number(bench.actual_max_kg), 110);
    assert.equal(Number(bench.est_1rm_kg), 110);

    const squat = await one(`
      select r.actual_max_kg from public.exercise_records r
      join public.exercises e on e.id = r.exercise_id where e.slug = 'back-squat'`);
    assert.equal(Number(squat.actual_max_kg), 130, 'the 300 kg of the active session is ignored');

    const rows = (
      await db.query(`select * from public.strength_by_group(date '2026-08-01', date '2026-10-08')`)
    ).rows;
    const by = Object.fromEntries(rows.map((r) => [r.muscle_group, Number(r.pct_change)]));
    assert.equal(by.chest, 10);
    assert.equal(by.legs, 30);
    assert.equal(by.overall, 18, 'overall = set-weighted average ((10x3 + 30x2) / 5)');

    await as(B);
    const other = await db.query(
      `select * from public.strength_by_group(date '2026-08-01', date '2026-10-08')`,
    );
    assert.equal(other.rows.length, 0, "strength functions only see the caller's data");
  });

  it('last_sets returns the completed sets of the latest finished session only', async () => {
    await as(A);
    const squat = (await one(`select id from public.exercises where slug = 'back-squat'`)).id;
    const rows = (await db.query(`select * from public.last_sets(array[$1::uuid])`, [squat])).rows;
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].weight_kg), 130, 'latest done session, not the active 300 kg one');
    await as(B);
    assert.equal(
      (await db.query(`select * from public.last_sets(array[$1::uuid])`, [squat])).rows.length,
      0,
    );
  });

  it('daily view also exposes the heaviest weight of the day', async () => {
    await as(A);
    const r = await one(`select max(best_weight_kg) as n from public.exercise_e1rm_daily`);
    assert.equal(Number(r.n), 130);
  });

  it('one active session per user', async () => {
    await as(A);
    await rejects(
      `insert into public.workout_sessions (started_at, status) values (now(), 'active')`,
      '23505',
    );
  });

  it('daily totals = food logs + done/adjusted fixed meals (skipped and deleted excluded)', async () => {
    await as(A);
    await db.exec(`
      insert into public.food_logs (day, meal, name, grams, kcal, protein_g)
        values ('2026-10-09', 'lunch', 'Rice', 100, 350, 7);
      insert into public.food_logs (day, meal, name, grams, kcal, deleted_at)
        values ('2026-10-09', 'lunch', 'Deleted entry', 100, 999, now());
      insert into public.fixed_meal_plans (id, name) values ('22222222-0000-0000-0000-000000000001', 'Plan');
      insert into public.fixed_meals (id, plan_id, position, name, kcal) values
        ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 0, 'Breakfast', 500),
        ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 1, 'Lunch', 750);
      insert into public.fixed_meal_checks (day, fixed_meal_id, status, kcal) values
        ('2026-10-09', '33333333-0000-0000-0000-000000000001', 'done', 500),
        ('2026-10-09', '33333333-0000-0000-0000-000000000002', 'skipped', 750);
    `);
    const r = await one(`select kcal from public.daily_nutrition_totals where day = '2026-10-09'`);
    assert.equal(Number(r.kcal), 850);
  });

  it('a fixed meal can be checked only once per day', async () => {
    await as(A);
    await rejects(
      `insert into public.fixed_meal_checks (day, fixed_meal_id, status, kcal)
       values ('2026-10-09', '33333333-0000-0000-0000-000000000001', 'done', 500)`,
      '23505',
    );
  });

  it('safety: targets under 1500 kcal and deficits over 25% are rejected', async () => {
    await as(A);
    await rejects(
      `insert into public.nutrition_goals (valid_from, kcal, protein_g, carbs_g, fat_g)
       values ('2026-10-08', 1400, 100, 100, 50)`,
      '23514',
    );
    await rejects(
      `insert into public.nutrition_goals (valid_from, kcal, protein_g, carbs_g, fat_g, maintenance_kcal)
       values ('2026-10-08', 1900, 150, 200, 60, 2600)`,
      '23514',
    );
    await db.exec(
      `insert into public.nutrition_goals (valid_from, kcal, protein_g, carbs_g, fat_g, maintenance_kcal)
       values ('2026-10-08', 2350, 160, 260, 75, 2600)`,
    );
  });

  it('progress photos must live in the owner folder', async () => {
    await as(A);
    await rejects(
      `insert into public.progress_photos (day, pose, storage_path)
       values ('2026-10-08', 'front', '${B}/front.jpg')`,
      '23514',
    );
    await db.exec(
      `insert into public.progress_photos (day, pose, storage_path)
       values ('2026-10-08', 'front', '${A}/front.jpg')`,
    );
  });

  it('updated_at is set by the server on update', async () => {
    await as(A);
    const before = await one(`select updated_at from public.body_metrics limit 1`);
    await new Promise((r) => setTimeout(r, 20));
    await db.exec(`update public.body_metrics set weight_kg = 78.2`);
    const after = await one(`select updated_at from public.body_metrics limit 1`);
    assert.ok(new Date(after.updated_at) > new Date(before.updated_at));
  });
});

describe('vip users and admin audit', () => {
  before(async () => {
    await admin();
    await db.exec(`insert into public.admin_audit (action) values ('test')`);
  });

  it('a user sees only their own vip row', async () => {
    await as(A);
    assert.equal(await count('select count(*) as n from public.vip_users'), 1);
    await as(C);
    assert.equal(await count('select count(*) as n from public.vip_users'), 0);
  });

  it('a user cannot make themselves vip, change it or remove it', async () => {
    await as(C);
    await rejects(`insert into public.vip_users (user_id) values ('${C}')`, '42501');
    await as(A);
    const changed = await db.query(`update public.vip_users set note = 'hacked' returning user_id`);
    assert.equal(changed.rows.length, 0);
    const removed = await db.query(`delete from public.vip_users returning user_id`);
    assert.equal(removed.rows.length, 0);
    await admin();
    assert.equal(await count('select count(*) as n from public.vip_users'), 2);
  });

  it('the admin audit is closed to every user', async () => {
    await as(A);
    assert.equal(await count('select count(*) as n from public.admin_audit'), 0);
    await rejects(`insert into public.admin_audit (action) values ('forged')`, '42501');
  });
});

describe('admin data browser hides content and secrets (admin/privacy.js, DECISIONS 74)', () => {
  const columnsOf = async (schema, table) =>
    (
      await db.query(
        `select column_name as name from information_schema.columns
         where table_schema = $1 and table_name = $2 order by ordinal_position`,
        [schema, table],
      )
    ).rows.map((r) => r.name);
  const META = new Set([
    ...['id', 'user_id', 'owner_id', 'created_at', 'updated_at', 'deleted_at', 'server_at'],
  ]);

  it('every table holding a person’s own data shows only keys and times', async () => {
    await admin();
    const tables = (
      await db.query(
        `select distinct c.table_name as name from information_schema.columns c
         join information_schema.tables t using (table_schema, table_name)
         where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.column_name = 'user_id'`,
      )
    ).rows.map((r) => r.name);
    // Health, diet and training tables must be among them, fully hidden.
    for (const table of ['body_metrics', 'food_logs', 'workout_sessions', 'consents', 'vault_rows'])
      assert.ok(tables.includes(table), table);
    // Tables about the account itself (plans, credit, tokens, sync…) keep their columns visible
    // (secrets aside); every other table with a user_id is a person's own data.
    const accountTables = new Set([
      ...['user_plans', 'vip_users', 'ai_credit', 'ai_usage', 'api_tokens', 'account_sync'],
      ...['app_errors', 'oauth_codes', 'relay_devices', 'password_reset_requests', 'admin_audit'],
    ]);
    for (const table of [...tables, 'profiles']) {
      if (accountTables.has(table)) continue;
      const cols = await columnsOf('public', table);
      const mask = maskOf('public', table, cols);
      for (const c of cols)
        if (!META.has(c) && !c.endsWith('_id') && c !== 'server_at')
          assert.ok(mask.always.has(c), `${table}.${c} is shown in the admin data browser`);
    }
    const profile = maskOf('public', 'profiles', await columnsOf('public', 'profiles'));
    for (const c of await columnsOf('public', 'profiles'))
      if (!META.has(c)) assert.ok(profile.always.has(c), `profiles.${c} must be hidden`);
    const body = maskOf('public', 'body_metrics', await columnsOf('public', 'body_metrics'));
    assert.ok(body.always.has('day') && !body.always.has('user_id'));
  });

  it('password hashes and tokens are hidden everywhere, emails stay', async () => {
    // The stub of auth.users here has few columns: the real table's (GoTrue) password hash column.
    const users = maskOf('auth', 'users', [
      ...(await columnsOf('auth', 'users')),
      'encrypted_password',
      'confirmation_token',
      'recovery_token',
    ]);
    assert.ok(users.always.has('confirmation_token') && users.always.has('recovery_token'));
    assert.ok(users.always.has('encrypted_password'));
    assert.ok(!users.always.has('email'));
    const tokens = maskOf('public', 'api_tokens', await columnsOf('public', 'api_tokens'));
    assert.ok(tokens.always.has('token_hash') && tokens.always.has('refresh_hash'));
    assert.ok(!tokens.always.has('name') && !tokens.always.has('last_used_at'));
  });

  it('catalogue rows stay readable, the ones a person made are hidden; search skips hidden', async () => {
    const cols = await columnsOf('public', 'foods');
    const mask = maskOf('public', 'foods', cols);
    const columns = ['id', 'owner_id', 'name'];
    const { rows, masked } = maskRows(mask, columns, [
      ['f1', null, 'Apple'],
      ['f2', A, 'My secret shake'],
    ]);
    assert.deepEqual(rows[0], ['f1', null, 'Apple']);
    assert.deepEqual(rows[1], ['f2', A, null]);
    assert.deepEqual(masked, [[], ['name']]);
    const profileCols = await columnsOf('public', 'profiles');
    assert.deepEqual(
      searchableColumns(maskOf('public', 'profiles', profileCols), profileCols).sort(),
      [...profileCols.filter((c) => META.has(c))].sort(),
    );
  });
});

describe('every account keeps its data on the server (DECISIONS 47)', () => {
  it('is_premium() ("can keep data online") is true for any account, false without one', async () => {
    await as(A);
    assert.equal((await one('select public.is_premium() as p')).p, true);
    await as(C);
    assert.equal((await one('select public.is_premium() as p')).p, true);
    await admin();
    await db.exec('set role anon');
    assert.equal((await one('select public.is_premium() as p')).p, false);
  });

  it('a free account writes, changes and deletes its own data online', async () => {
    await as(C);
    await db.exec(`insert into public.water_logs (day, ml) values ('2026-10-08', 250)`);
    const changed = await db.query('update public.water_logs set ml = 500 returning id');
    assert.equal(changed.rows.length, 1);
    const removed = await db.query('delete from public.water_logs returning id');
    assert.equal(removed.rows.length, 1);
  });

  it('catalogue ids are the same as in the app', async () => {
    await admin();
    const r = await one(
      `select id from public.exercises where slug = 'bench-press' and owner_id is null`,
    );
    assert.equal(r.id, 'ca7a1090-0000-4000-8000-8444f9e37bc7');
  });

  it('clear_my_online_data removes every row of the caller and nobody else', async () => {
    await as(B);
    await db.exec(`
      insert into public.workout_plans (id, name, status) values ('44444444-0000-0000-0000-000000000001', 'B plan', 'active');
      insert into public.plan_days (id, plan_id, position, name) values ('44444444-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', 0, 'Day');
      insert into public.body_metrics (day, weight_kg) values ('2026-10-08', 70);
      insert into public.consents (type, policy_version) values ('health_data', '2026-10');
      update public.profiles set name = 'Bea';
    `);
    await admin();
    const othersBefore = await count(
      `select count(*) as n from public.body_metrics where user_id <> '${B}'`,
    );
    await as(B);
    await db.exec('select public.clear_my_online_data()');
    assert.equal(await count('select count(*) as n from public.workout_plans'), 0);
    assert.equal(await count('select count(*) as n from public.body_metrics'), 0);
    assert.equal(await count('select count(*) as n from public.consents'), 0);
    const p = await one('select name from public.profiles');
    assert.equal(p.name, null, 'an empty profile stays (every account has one)');
    await admin();
    assert.equal(
      await count(`select count(*) as n from public.body_metrics where user_id <> '${B}'`),
      othersBefore,
    );
  });
});

describe('premium sync (last change wins)', () => {
  const W = '55555555-0000-0000-0000-000000000001';
  const row = (ml, at) => ({ id: W, user_id: A, day: '2026-10-14', ml, updated_at: at });
  const push = (rows, deletes = []) =>
    db.query('select public.sync_push($1, $2::jsonb, $3::jsonb)', [
      'water_logs',
      JSON.stringify(rows),
      JSON.stringify(deletes),
    ]);
  const ml = async () =>
    (await one(`select ml from public.water_logs where id = '${W}'`))?.ml ?? null;

  it('stores a new row and keeps the time of the action', async () => {
    await as(A);
    await push([row(250, '2026-10-14T10:00:00Z')]);
    assert.equal(await ml(), 250);
    const r = await one(`select updated_at from public.water_logs where id = '${W}'`);
    assert.equal(new Date(r.updated_at).toISOString(), '2026-10-14T10:00:00.000Z');
  });

  it('a newer change wins, an older one arriving later is ignored', async () => {
    await as(A);
    await push([row(500, '2026-10-14T12:00:00Z')]);
    await push([row(750, '2026-10-14T11:00:00Z')]); // made earlier, sent later (offline phone)
    assert.equal(await ml(), 500);
  });

  it('the same change sent twice counts once', async () => {
    await as(A);
    await push([row(500, '2026-10-14T12:00:00Z')]);
    await push([row(500, '2026-10-14T12:00:00Z')]);
    assert.equal(await count(`select count(*) as n from public.water_logs where id = '${W}'`), 1);
    assert.equal(await ml(), 500);
    const r = await one(`select updated_at from public.water_logs where id = '${W}'`);
    assert.equal(
      new Date(r.updated_at).toISOString(),
      '2026-10-14T12:00:00.000Z',
      'a repeated change does not become newer',
    );
  });

  it('pull returns own changes since a time, not the catalogue', async () => {
    await as(A);
    const r = (await one(`select public.sync_pull('2000-01-01') as p`)).p;
    assert.ok(r.water_logs.some((w) => w.id === W));
    assert.ok(
      r.exercises.every((e) => e.owner_id === A),
      'catalogue rows are not sent',
    );
    assert.ok(!('server_at' in r.water_logs[0]));
    const later = (await one(`select public.sync_pull($1) as p`, [r.now])).p;
    assert.equal(later.water_logs.length, 0, 'nothing new since the last pull');
  });

  it('a delete made before the last change is ignored; a later one removes it and leaves a tombstone', async () => {
    await as(A);
    await push([], [{ id: W, at: '2026-10-14T11:30:00Z' }]);
    assert.equal(await ml(), 500, 'the 12:00 change is newer than the delete');
    await push([], [{ id: W, at: '2026-10-14T13:00:00Z' }]);
    assert.equal(await ml(), null);
    const r = (await one(`select public.sync_pull('2000-01-01') as p`)).p;
    assert.ok(r.tombstones.some((t) => t.table === 'water_logs' && t.id === W));
  });

  it("nobody can push into someone else's data", async () => {
    await as(B);
    await rejects(
      `select public.sync_push('water_logs', '[{"id":"55555555-0000-0000-0000-000000000002","user_id":"${A}","day":"2026-10-14","ml":1,"updated_at":"2026-10-14T00:00:00Z"}]', '[]')`,
      '42501',
    );
    await rejects(`select public.sync_push('vip_users', '[]', '[]')`, '22023');
  });
});

describe('generic foods (CIQUAL)', () => {
  it('are seeded with the same ids as the app, readable by everyone and writable by no user', async () => {
    await admin();
    assert.ok(
      (await count(`select count(*) as n from public.foods where source = 'ciqual'`)) >= 3000,
    );
    await as(C);
    const apple = await one(
      `select name, kcal_100g from public.foods where id = 'cf000000-0000-4000-8000-000000013039'`,
    );
    assert.equal(apple.name, 'Apple, pulp and peel, raw');
    assert.equal(Number(apple.kcal_100g), 52);
    await rejects(
      `insert into public.foods (name, kcal_100g, source, owner_id) values ('Fake', 1, 'ciqual', null)`,
      '42501',
    );
  });
});

describe('plans and AI credit', () => {
  const S = 'dddddddd-0000-0000-0000-00000000000d';

  before(async () => {
    await admin();
    await db.exec(`
      insert into auth.users (id, instance_id, aud, role, email)
        values ('${S}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's@test.dev');
      insert into public.account_sync (user_id, enabled) values ('${S}', true);
    `);
  });

  it('VIP accounts are premium, others free unless the admin set a plan', async () => {
    await as(A);
    assert.equal((await one('select public.my_plan() as p')).p, 'premium');
    await as(C);
    assert.equal((await one('select public.my_plan() as p')).p, 'free');
    await admin();
    await rejects(
      `insert into public.user_plans (user_id, plan) values ('${S}', 'supporter')`,
      '23514',
    );
  });

  it('free accounts keep data online too', async () => {
    await as(S);
    assert.equal((await one('select public.is_premium() as p')).p, true);
    await db.exec(`insert into public.water_logs (day, ml) values ('2026-10-15', 250)`);
  });

  it('premium gets 10 € of AI credit a month, carried over up to 15 €; supporters none', async () => {
    await as(A);
    const first = (await one('select public.my_ai_credit() as c')).c;
    assert.equal(first.plan, 'premium');
    assert.equal(Number(first.balance_micros), 10_000_000);
    // Three months go by without using it: the balance stops at the cap.
    await admin();
    await db.exec(
      `update public.ai_credit set next_grant = current_date - interval '3 months' where user_id = '${A}'`,
    );
    await as(A);
    assert.equal(
      Number((await one('select public.my_ai_credit() as c')).c.balance_micros),
      15_000_000,
    );
    await as(S);
    assert.equal(Number((await one('select public.my_ai_credit() as c')).c.balance_micros), 0);
  });

  it('only the server can charge or top up the credit', async () => {
    await as(A);
    await rejects(`select public.ai_charge('${A}', 'x', 1, 1, -100000000)`, '42501');
    await rejects(`select public.ai_refresh_credit('${A}')`, '42501');
    await rejects(`select public.plan_of('${C}')`, '42501');
    await admin();
    const left = Number(
      (await one(`select public.ai_charge('${A}', 'm', 100, 50, 1500000) as b`)).b,
    );
    assert.equal(left, 13_500_000);
    assert.equal(
      await count(`select count(*) as n from public.ai_usage where user_id = '${A}'`),
      1,
    );
  });

  it('a user cannot give themselves a plan', async () => {
    await as(C);
    await rejects(
      `insert into public.user_plans (user_id, plan) values ('${C}', 'premium')`,
      '42501',
    );
  });
});

describe('server settings (admin panel)', () => {
  it('the AI model setting is hidden from users and only one known key can exist', async () => {
    await admin();
    await db.exec(`insert into public.app_settings (key, value) values ('ai_model', 'x/y')`);
    await rejects(`insert into public.app_settings (key, value) values ('other', 'x')`, '23514');
    await as(A);
    await rejects(`select * from public.app_settings`, '42501');
    await rejects(`update public.app_settings set value = 'a/b'`, '42501');
    await admin();
    await db.exec(`delete from public.app_settings`);
  });
});

describe('personal API and MCP (server/api.js)', () => {
  // The api service, on this database: each call runs as the token's user (RLS applies).
  const testDb = {
    tokenFor,
    async asUser(uid, fn) {
      await admin();
      await db.exec('begin');
      try {
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: uid, role: 'authenticated' }),
        ]);
        await db.exec('set local role authenticated');
        // Dates as YYYY-MM-DD text, like the real server (server/index.js sets the same parser).
        const asText = { parsers: { 1082: (v) => v, 1700: (v) => Number(v) } };
        const result = await fn(async (sql, params) => (await db.query(sql, params, asText)).rows);
        await db.exec('commit');
        return result;
      } catch (e) {
        await db.exec('rollback');
        throw e;
      }
    },
  };
  const api = createApi(testDb);
  let token = '';
  const D = '2026-10-16';
  const call = (method, path, body, t = token, query = {}) =>
    api({ method, path, query, body, headers: t ? { authorization: `Bearer ${t}` } : {} });
  let rpcId = 0;
  const mcp = async (method, params) =>
    (await call('POST', '/mcp', { jsonrpc: '2.0', id: ++rpcId, method, params })).body;
  const tool = async (name, args) => {
    const r = (await mcp('tools/call', { name, arguments: args })).result;
    return r.isError ? { error: r.content[0].text } : JSON.parse(r.content[0].text);
  };

  it('every account can make a token, shown once (only its hash is kept)', async () => {
    await as(C);
    assert.match((await one(`select public.create_api_token('mine') as t`)).t, /^fft_/);
    await as(A);
    token = (await one(`select public.create_api_token('Claude') as t`)).t;
    assert.match(token, /^fft_[0-9a-f]{64}$/);
    const row = await one(`select name, prefix, token_hash from public.api_tokens`);
    assert.equal(row.name, 'Claude');
    assert.equal(row.prefix, token.slice(0, 10));
    assert.equal(row.token_hash, hashToken(token));
    await rejects(`select public.api_token_user('${hashToken(token)}')`, '42501');
    await rejects(
      `insert into public.api_tokens (name, prefix, token_hash) values ('x', 'x', 'x')`,
      '42501',
    );
  });

  it('no token or a wrong one is refused', async () => {
    assert.equal((await call('GET', '/v1/me', undefined, '')).status, 401);
    assert.equal((await call('GET', '/v1/me', undefined, 'fft_nope')).status, 401);
    assert.equal(
      (await call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, '')).status,
      401,
    );
  });

  it('REST: logs water and reads it back, as the token owner', async () => {
    const r = await call('POST', '/v1/water', { day: D, ml: 300 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body, { day: D, added_ml: 300, total_ml: 300 });
    const list = await call('GET', '/v1/water', undefined, token, { from: D, to: D });
    assert.deepEqual(list.body, [{ day: D, ml: 300 }]);
    await admin();
    assert.equal(
      await count(
        `select count(*) as n from public.water_logs where day = '${D}' and user_id = '${A}'`,
      ),
      1,
    );
  });

  it('MCP: initialize, list the tools, log a generic food by id and see it in the day', async () => {
    const init = (await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {} }))
      .result;
    assert.equal(init.protocolVersion, '2025-06-18');
    assert.equal(init.serverInfo.name, 'fft');
    const names = (await mcp('tools/list')).result.tools.map((t) => t.name);
    assert.ok(names.includes('log_food') && names.includes('get_day'));

    const found = await tool('search_foods', { query: 'apple' });
    assert.ok(found.length > 0);
    const logged = await tool('log_food', {
      day: D,
      meal: 'snack',
      food_id: 'cf000000-0000-4000-8000-000000013039', // Apple, 52 kcal / 100 g
      grams: 200,
    });
    assert.equal(logged.kcal, 104);
    const summary = await tool('get_day', { day: D });
    assert.equal(summary.eaten.kcal, 104);
    assert.equal(summary.water_ml, 300);
    assert.equal(summary.food_logs.length, 1);

    assert.equal((await tool('remove_food_log', { id: logged.id })).deleted, logged.id);
    assert.equal((await tool('get_day', { day: D })).eaten.kcal, 0);
  });

  it('a day keeps one body entry: new values replace that day, the others stay', async () => {
    await tool('log_body', { day: D, weight_kg: 80.5 });
    await tool('log_body', { day: D, body_fat_pct: 18 });
    const rows = (await call('GET', '/v1/body', undefined, token, { from: D, to: D })).body;
    assert.deepEqual(rows, [{ day: D, weight_kg: 80.5, body_fat_pct: 18 }]);
  });

  it('bad input and database rules come back as clear errors, nothing is written', async () => {
    assert.match(
      (await tool('log_food', { meal: 'brunch', name: 'x', kcal: 1 })).error,
      /meal must be/,
    );
    assert.match((await tool('log_body', { day: D, weight_kg: 900 })).error, /weight_kg/);
    assert.equal((await call('GET', '/v1/nope')).status, 404);
    assert.equal((await mcp('nope/nope')).error.code, -32601);
  });

  it('a revoked token stops at once', async () => {
    await as(A);
    const id = (await one(`select id from public.api_tokens limit 1`)).id;
    await db.query('select public.set_api_token_revoked($1, true)', [id]);
    assert.equal((await call('GET', '/v1/me')).status, 401);
    await as(A);
    await db.query('select public.set_api_token_revoked($1, false)', [id]);
    assert.equal((await call('GET', '/v1/me')).status, 200);
  });

  it('too many requests in a minute are refused', async () => {
    const strict = createApi(testDb, { perMinute: 2 });
    const go = () =>
      strict({ method: 'GET', path: '/v1/goals', headers: { authorization: `Bearer ${token}` } });
    assert.equal((await go()).status, 200);
    assert.equal((await go()).status, 200);
    assert.equal((await go()).status, 429);
  });

  it('tokens are read and write by default; a read-only token can be made', async () => {
    await as(A);
    assert.equal(
      (await one(`select scope from public.api_tokens where token_hash = $1`, [hashToken(token)]))
        .scope,
      'write',
    );
    const read = (await one(`select public.create_api_token('Reader', 'read') as t`)).t;
    assert.equal(
      (await one(`select scope from public.api_tokens where name = 'Reader'`)).scope,
      'read',
    );
    await rejects(`select public.create_api_token('Bad', 'admin')`, '22023');
    // Users cannot widen a token themselves.
    await rejects(`update public.api_tokens set scope = 'write' where name = 'Reader'`, '42501');
    await rejects(`select * from public.api_token_access('${hashToken(read)}')`, '42501');
    await admin();
    assert.deepEqual(
      (await db.query('select user_id, scope from public.api_token_access($1)', [hashToken(read)]))
        .rows,
      [{ user_id: A, scope: 'read' }],
    );
    assert.equal((await one('select public.api_token_user($1) as u', [hashToken(read)])).u, A);
  });

  it('a read-only token reads but every change is refused (REST and MCP)', async () => {
    await as(A);
    const read = (await one(`select public.create_api_token('Reader 2', 'read') as t`)).t;
    const before = await count(`select count(*) as n from public.water_logs`);
    // Reading works.
    assert.equal((await call('GET', '/v1/me', undefined, read)).status, 200);
    assert.equal((await call('POST', '/v1/tools/get_goals', {}, read)).status, 200);
    // REST writes: 403 with a clear message.
    const post = await call('POST', '/v1/water', { day: D, ml: 250 }, read);
    assert.equal(post.status, 403);
    assert.match(post.body.error, /read only/);
    assert.equal((await call('POST', '/v1/tools/log_water', { ml: 250 }, read)).status, 403);
    assert.equal((await call('DELETE', `/v1/food-logs/${A}`, undefined, read)).status, 403);
    // MCP: only the read-only tools are listed, write tools are refused.
    const rpc = async (method, params) =>
      (await call('POST', '/mcp', { jsonrpc: '2.0', id: ++rpcId, method, params }, read)).body;
    const listed = (await rpc('tools/list')).result.tools;
    assert.ok(listed.length > 0);
    assert.ok(listed.every((t) => t.annotations.readOnlyHint));
    const names = listed.map((t) => t.name);
    assert.ok(names.includes('get_day') && names.includes('query_data'));
    assert.ok(!names.includes('log_water') && !names.includes('propose_plans'));
    assert.match((await rpc('initialize', {})).result.instructions, /read only/);
    const refused = (await rpc('tools/call', { name: 'log_water', arguments: { ml: 250 } })).result;
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /read only/);
    assert.ok(!(await rpc('tools/call', { name: 'get_profile', arguments: {} })).result.isError);
    await as(A);
    assert.equal(await count(`select count(*) as n from public.water_logs`), before);
    // The read-and-write token still lists every tool.
    assert.ok((await mcp('tools/list')).result.tools.some((t) => t.name === 'log_water'));
  });

  // The in-app coach's tools on the server (server/coach.js + src/domain, the same code as the app).
  it('MCP lists the coach tools and says which ones change data', async () => {
    const tools = (await mcp('tools/list')).result.tools;
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    for (const n of ['list_data', 'query_data', 'get_strength', 'propose_plans', 'set_supplement'])
      assert.ok(byName[n], n);
    assert.equal(byName.query_data.annotations.readOnlyHint, true);
    assert.equal(byName.propose_plans.annotations.readOnlyHint, false);
  });

  it('list_data and query_data read everything, as the coach does', async () => {
    const map = await tool('list_data', {});
    assert.ok(map.tables.some((t) => t.table === 'supplements'));
    assert.ok(!map.tables.find((t) => t.table === 'body_metrics').columns.includes('server_at'));
    const r = await tool('query_data', {
      table: 'body_metrics',
      columns: ['day', 'weight_kg'],
      where: [
        { column: 'weight_kg', op: 'not_null' },
        { column: 'day', op: '=', value: D },
      ],
    });
    assert.equal(r.matching_rows, 1);
    assert.deepEqual(r.rows, [{ day: D, weight_kg: 80.5 }]);
    assert.match((await tool('query_data', { table: 'auth_users' })).error, /must be one of/);
  });

  it('calorie target: the same safety rules as the app', async () => {
    assert.match(
      (await tool('set_nutrition_goal', { kcal: 1200, protein_g: 100, carbs_g: 120, fat_g: 36 }))
        .error,
      /1500/,
    );
    assert.match(
      (await tool('set_nutrition_goal', { kcal: 2000, protein_g: 10, carbs_g: 10, fat_g: 10 }))
        .error,
      /within 10%/,
    );
    const ok = await tool('set_nutrition_goal', {
      kcal: 2200,
      protein_g: 160,
      carbs_g: 230,
      fat_g: 70,
    });
    assert.equal(ok.saved, true);
    assert.equal((await tool('get_diet', {})).diet_plan.daily.kcal, 2200);
  });

  it('supplements: add one, tick it, untick it', async () => {
    await tool('add_supplement', { name: 'Creatine', dose: '5 g' });
    assert.deepEqual(await tool('set_supplement', { name: 'creatine', day: D }), {
      supplement: 'Creatine',
      day: D,
      taken: true,
    });
    await tool('set_supplement', { name: 'creatine', day: D }); // twice = still one tick
    const ticks = await tool('query_data', {
      table: 'supplement_logs',
      where: [{ column: 'day', op: '=', value: D }],
    });
    assert.equal(ticks.matching_rows, 1);
    await tool('set_supplement', { name: 'Creatine', day: D, taken: false });
    assert.equal((await tool('query_data', { table: 'supplement_logs' })).matching_rows, 0);
  });

  it('propose_plans: a new workout plan and a diet, in the coach format', async () => {
    const r = await tool('propose_plans', {
      workout_plan: {
        name: 'API plan',
        days: [
          {
            name: 'Push',
            exercises: [
              { exercise: 'Barbell bench press', sets: 3, reps: '8-10', rest_s: 120 },
              { exercise: 'Cable fly', sets: 3, reps: '12', rest_s: 0, superset_with_next: true },
              { exercise: 'Push-up', sets: 3, reps: '15', rest_s: 90, superset_with_next: true },
              {
                exercise: 'Chest press machine',
                sets: 3,
                reps: '8-10',
                drops: { on: 'last', reps: ['10', '12'] },
              },
            ],
          },
        ],
      },
      diet_plan: {
        mode: 'tracking',
        daily: { kcal: 2300, protein_g: 170, carbs_g: 240, fat_g: 72 },
      },
    });
    assert.equal(r.saved, true, JSON.stringify(r));
    assert.equal(r.diet_applied, true);
    const plans = (await tool('get_workout_plans', {})).workout_plans;
    const made = plans.find((p) => p.id === r.workout_plan_id);
    assert.equal(made.days[0].exercises[0].exercise, 'Barbell bench press');
    // Superset: fly + push-up; the last exercise cannot be linked with a next one.
    assert.deepEqual(
      made.days[0].exercises.map((e) => e.superset_with_next ?? false),
      [false, true, true, false],
    );
    assert.deepEqual(made.days[0].exercises[3].drops, { on: 'last', reps: ['10', '12'] });
    // Changing it keeps a backup copy, archived.
    const again = await tool('propose_plans', {
      workout_plan: { ...made, name: 'API plan v2' },
    });
    assert.equal(again.workout_updated, true);
    assert.equal(again.backup, 'API plan (before AI)');
  });

  it('own foods: create, change, delete; catalogue foods cannot be changed', async () => {
    const { food_id } = await tool('create_food', {
      name: 'Protein bar',
      kcal_100g: 380,
      protein_100g: 30,
      carbs_100g: 35,
      fat_100g: 12,
      portions: [{ label: '1 bar', grams: 60 }],
    });
    assert.equal((await tool('update_food', { food_id, kcal_100g: 390 })).updated, food_id);
    assert.match(
      (await tool('update_food', { food_id: 'cf000000-0000-4000-8000-000000013039', kcal_100g: 1 }))
        .error,
      /Only foods you created/,
    );
    assert.equal((await tool('delete_food', { food_id })).deleted, 'Protein bar');
  });

  it('every tool is also REST: POST /v1/tools/<name>', async () => {
    const r = await call('POST', '/v1/tools/get_strength', { period: '4w' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok('strength_score_pct' in r.body);
    assert.equal((await call('POST', '/v1/tools/nope', {})).status, 404);
  });

  it('without a token, MCP points AI apps to the sign-in (OAuth metadata)', async () => {
    const withBase = createApi(testDb, { base: 'https://api.test' });
    const r = await withBase({ method: 'POST', path: '/mcp', headers: {}, body: {} });
    assert.equal(r.status, 401);
    assert.equal(
      r.headers['www-authenticate'],
      'Bearer resource_metadata="https://api.test/.well-known/oauth-protected-resource"',
    );
  });

  it('an MCP batch counts each message toward the limit, and is at most 20 (DECISIONS 76)', async () => {
    const small = createApi(testDb, { perMinute: 5 });
    const batch = (n) =>
      small({
        method: 'POST',
        path: '/mcp',
        headers: { authorization: `Bearer ${token}` },
        body: Array.from({ length: n }, (_, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'ping' })),
      });
    assert.equal((await batch(21)).status, 400);
    const four = await batch(4);
    assert.equal(four.status, 200);
    assert.equal(four.body.length, 4);
    // 4 + 2 = 6 > 5: refused, although it is only the second request.
    assert.equal((await batch(2)).status, 429);
  });

  it('health data consent withdrawn: the API and MCP refuse, until it is given again (DECISIONS 80)', async () => {
    await as(A);
    assert.equal((await call('GET', '/v1/me')).status, 200);
    await as(A);
    await db.exec('select public.set_health_consent(false)');
    const refused = await call('GET', '/v1/me');
    assert.equal(refused.status, 403);
    assert.match(refused.body.error, /consent/);
    assert.equal(
      (await call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status,
      403,
    );
    // The owner can see the state; nobody can write it directly.
    await as(A);
    assert.ok(
      (await one('select health_withdrawn_at from public.account_consent')).health_withdrawn_at,
    );
    await rejects(`update public.account_consent set health_withdrawn_at = null`, '42501');
    await rejects(`select public.health_consent_of('${A}')`, '42501');
    await db.exec('select public.set_health_consent(true)');
    assert.equal((await call('GET', '/v1/me')).status, 200);
  });
});

describe('sign in with FFT for AI apps (server/oauth.js)', () => {
  const BASE = 'https://api.test';
  const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
  const users = { 'a@test.dev': A, 'c@test.dev': C };
  const oauth = createOAuth({
    sql: async (text, params) => {
      await admin();
      return (await db.query(text, params)).rows;
    },
    // The auth service checks passwords; here: the right one is "right".
    signIn: async (email, password) => (password === 'right' ? (users[email] ?? null) : null),
    base: BASE,
  });
  const api = createApi(
    {
      tokenFor,
      async asUser(uid, fn) {
        await as(uid);
        return fn(async (sql, params) => (await db.query(sql, params)).rows);
      },
    },
    { base: BASE },
  );
  const b64url = (b) =>
    b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const verifier = 'v'.repeat(50);
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const go = (method, path, body, query = {}, headers = {}) =>
    oauth({ method, path, body, query, headers, ip: '1.2.3.4' });
  let clientId = '';
  let refresh = '';
  let access = '';
  const authorize = (email, password, extra = {}) =>
    go('POST', '/oauth/authorize', {
      client_id: clientId,
      redirect_uri: REDIRECT,
      state: 'xyz',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      email,
      password,
      ...extra,
    });

  it('the app finds the sign-in and registers itself', async () => {
    const meta = JSON.parse((await go('GET', '/.well-known/oauth-authorization-server')).body);
    assert.equal(meta.token_endpoint, `${BASE}/oauth/token`);
    assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);
    const res = JSON.parse((await go('GET', '/.well-known/oauth-protected-resource/mcp')).body);
    assert.equal(res.resource, `${BASE}/mcp`);
    assert.equal(
      (await go('POST', '/oauth/register', { redirect_uris: ['http://evil.com/cb'] })).status,
      400,
    );
    const reg = await go('POST', '/oauth/register', {
      redirect_uris: [REDIRECT],
      client_name: 'Claude',
    });
    assert.equal(reg.status, 201);
    clientId = JSON.parse(reg.body).client_id;
  });

  it('the sign-in page names the app; a wrong password gets no code', async () => {
    const pageRes = await go('GET', '/oauth/authorize', undefined, {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
    });
    assert.equal(pageRes.status, 200);
    assert.match(pageRes.body, /<b>Claude<\/b> wants to use your FFT data/);
    // The page says where the access goes (the host, which the app cannot pick freely).
    assert.match(pageRes.body, /access to your data goes to <b>claude\.ai<\/b>/);
    assert.match(
      pageRes.headers['content-security-policy'],
      /form-action 'self' https:\/\/claude\.ai;/,
    );
    // The permission is a visible choice; Read only is preselected (DECISIONS 73).
    assert.match(pageRes.body, /name="access" value="read" checked/);
    assert.match(pageRes.body, /name="access" value="write">/);
    assert.equal(
      (
        await go('GET', '/oauth/authorize', undefined, {
          client_id: clientId,
          redirect_uri: 'https://other.dev/cb',
          code_challenge: challenge,
        })
      ).status,
      400,
    );
    assert.match((await authorize('a@test.dev', 'wrong')).body, /Wrong email or password/);
  });

  it('right password: code, then a token that works on MCP; the code works once', async () => {
    const r = await authorize('a@test.dev', 'right');
    assert.equal(r.status, 302);
    const back = new URL(r.headers.location);
    assert.equal(back.origin + back.pathname, REDIRECT);
    assert.equal(back.searchParams.get('state'), 'xyz');
    const code = back.searchParams.get('code');
    const exchange = (v) =>
      go('POST', '/oauth/token', {
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: v,
      });
    const bad = await exchange('x'.repeat(50));
    assert.equal(JSON.parse(bad.body).error, 'invalid_grant');
    // The code was spent by the wrong attempt too: sign in again.
    const again = new URL((await authorize('a@test.dev', 'right')).headers.location);
    const t = await go('POST', '/oauth/token', {
      grant_type: 'authorization_code',
      code: again.searchParams.get('code'),
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
    });
    const tokens = JSON.parse(t.body);
    assert.equal(t.status, 200, t.body);
    assert.match(tokens.access_token, /^fft_/);
    access = tokens.access_token;
    refresh = tokens.refresh_token;
    const me = await api({
      method: 'POST',
      path: '/mcp',
      headers: { authorization: `Bearer ${access}` },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_profile', arguments: {} },
      },
    });
    assert.equal(me.status, 200);
    assert.ok(!me.body.result.isError);
    const reuse = await go('POST', '/oauth/token', {
      grant_type: 'authorization_code',
      code: again.searchParams.get('code'),
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
    });
    assert.equal(JSON.parse(reuse.body).error, 'invalid_grant');
    // The connection shows in the user's token list, named after the app.
    await as(A);
    assert.equal(
      await count(
        `select count(*) as n from public.api_tokens where name = 'Claude' and client_id is not null and deleted_at is null`,
      ),
      1,
    );
  });

  it('the refresh token renews the access; revoking in the app ends the connection', async () => {
    const r = await go('POST', '/oauth/token', {
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: clientId,
    });
    const next = JSON.parse(r.body);
    assert.equal(r.status, 200, r.body);
    const asAccess = (t) =>
      api({ method: 'GET', path: '/v1/me', headers: { authorization: `Bearer ${t}` } });
    assert.equal((await asAccess(access)).status, 401); // the old access token is replaced
    assert.equal((await asAccess(next.access_token)).status, 200);
    await as(A);
    const id = (
      await one(
        `select id from public.api_tokens where name = 'Claude' and client_id is not null and deleted_at is null`,
      )
    ).id;
    await db.query('select public.set_api_token_revoked($1, true)', [id]);
    assert.equal((await asAccess(next.access_token)).status, 401);
    const after = await go('POST', '/oauth/token', {
      grant_type: 'refresh_token',
      refresh_token: next.refresh_token,
      client_id: clientId,
    });
    assert.equal(JSON.parse(after.body).error, 'invalid_grant');
  });

  it('a read-only connection: preselected whatever the app asks, kept on refresh', async () => {
    const ask = (scope) =>
      go('GET', '/oauth/authorize', undefined, {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        scope,
      });
    assert.match((await ask('read')).body, /name="access" value="read" checked/);
    assert.match((await ask('read write')).body, /name="access" value="read" checked/);
    const exchange = async (location) =>
      JSON.parse(
        (
          await go('POST', '/oauth/token', {
            grant_type: 'authorization_code',
            code: new URL(location).searchParams.get('code'),
            redirect_uri: REDIRECT,
            client_id: clientId,
            code_verifier: verifier,
          })
        ).body,
      );
    const mcpAs = async (t, method, params) =>
      (
        await api({
          method: 'POST',
          path: '/mcp',
          headers: { authorization: `Bearer ${t}` },
          body: { jsonrpc: '2.0', id: 1, method, params },
        })
      ).body.result;

    // The app asked for write, the user picked read only on the page: the user wins.
    const r = await authorize('c@test.dev', 'right', { scope: 'write', access: 'read' });
    assert.equal(r.status, 302);
    const t = await exchange(r.headers.location);
    assert.equal(t.scope, 'read');
    await as(C);
    assert.equal(
      (
        await one(
          `select scope from public.api_tokens where client_id is not null and deleted_at is null`,
        )
      ).scope,
      'read',
    );
    const names = (await mcpAs(t.access_token, 'tools/list')).tools.map((x) => x.name);
    assert.ok(names.includes('get_day') && !names.includes('log_food'));
    const refused = await mcpAs(t.access_token, 'tools/call', {
      name: 'log_water',
      arguments: { ml: 200 },
    });
    assert.equal(refused.isError, true);

    // Refresh keeps read only.
    const renewed = JSON.parse(
      (
        await go('POST', '/oauth/token', {
          grant_type: 'refresh_token',
          refresh_token: t.refresh_token,
          client_id: clientId,
        })
      ).body,
    );
    assert.equal(renewed.scope, 'read');
    assert.equal(
      (
        await mcpAs(renewed.access_token, 'tools/call', {
          name: 'log_water',
          arguments: { ml: 200 },
        })
      ).isError,
      true,
    );

    // No choice sent (an older page): read only, even when the app asked for write.
    const plain = await authorize('c@test.dev', 'right', { scope: 'write' });
    assert.equal((await exchange(plain.headers.location)).scope, 'read');
    // Read and write only when the user picks it.
    const rw = await authorize('c@test.dev', 'right', { access: 'write' });
    assert.equal((await exchange(rw.headers.location)).scope, 'write');
  });

  describe('only approved AI apps, connections that end (DECISIONS 73)', () => {
    // Each call from its own address unless one is given (the limit counts refused calls too).
    let n = 0;
    const register = (uris, ip = `7.7.7.${(n += 1)}`) =>
      oauth({
        method: 'POST',
        path: '/oauth/register',
        body: { redirect_uris: uris, client_name: 'Some app' },
        query: {},
        headers: {},
        ip,
      });
    const signInPage = (id, redirect) =>
      go('GET', '/oauth/authorize', undefined, {
        response_type: 'code',
        client_id: id,
        redirect_uri: redirect,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });

    it('a redirect to an unapproved host is refused at registration', async () => {
      for (const bad of [
        'https://evil.com/cb',
        'https://claude.ai.evil.com/cb',
        'https://evilclaude.ai/cb',
        'https://claude.ai:8443/cb',
        'http://claude.ai/cb',
        'https://user@claude.ai/cb',
        'https://claude.ai/cb#x',
        'cursor://oauth/callback',
        'javascript:alert(1)',
      ]) {
        const r = await register([bad]);
        assert.equal(r.status, 400, bad);
        assert.equal(JSON.parse(r.body).error, 'invalid_redirect_uri', bad);
      }
      // One bad address among good ones: refused too.
      assert.equal(
        (await register(['https://chatgpt.com/connector_platform_oauth_redirect', 'https://x.dev']))
          .status,
        400,
      );
      for (const good of [
        'https://chatgpt.com/connector_platform_oauth_redirect',
        'https://claude.com/api/mcp/auth_callback',
        'http://localhost:33418/callback',
        'http://127.0.0.1:5173/cb',
      ])
        assert.equal((await register([good])).status, 201, good);
    });

    it('an app registered with an unapproved host gets no sign-in page, so no code', async () => {
      await admin();
      await db.query(
        `insert into public.oauth_clients (id, name, redirect_uris) values ('fftc_old', 'Old', $1)`,
        [['https://evil.com/cb']],
      );
      const r = await signInPage('fftc_old', 'https://evil.com/cb');
      assert.equal(r.status, 400);
      assert.match(JSON.parse(r.body).error_description, /not an approved app/);
      const post = await go('POST', '/oauth/authorize', {
        client_id: 'fftc_old',
        redirect_uri: 'https://evil.com/cb',
        code_challenge: challenge,
        email: 'a@test.dev',
        password: 'right',
      });
      assert.equal(post.status, 400);
      assert.equal(post.headers.location, undefined);
    });

    it('a desktop app on this computer is named as such on the page', async () => {
      const id = JSON.parse((await register(['http://127.0.0.1:5173/cb'])).body).client_id;
      const r = await signInPage(id, 'http://127.0.0.1:5173/cb');
      assert.equal(r.status, 200);
      assert.match(r.body, /a program on this computer \(<b>127\.0\.0\.1:5173<\/b>\)/);
    });

    it('registrations are limited per address', async () => {
      for (let i = 0; i < 10; i += 1)
        assert.equal((await register([REDIRECT], '8.8.8.8')).status, 201);
      const r = await register([REDIRECT], '8.8.8.8');
      assert.equal(r.status, 429);
      assert.equal((await register([REDIRECT], '8.8.4.4')).status, 201);
    });

    /** A fresh connection of A to claude.ai: its tokens. */
    const connect = async () => {
      // From its own address: the sign-in allows 10 attempts per address and minute.
      const r = await oauth({
        method: 'POST',
        path: '/oauth/authorize',
        body: {
          client_id: clientId,
          redirect_uri: REDIRECT,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          email: 'a@test.dev',
          password: 'right',
          access: 'read',
        },
        query: {},
        headers: {},
        ip: `6.6.6.${(n += 1)}`,
      });
      const t = await go('POST', '/oauth/token', {
        grant_type: 'authorization_code',
        code: new URL(r.headers.location).searchParams.get('code'),
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: verifier,
      });
      assert.equal(t.status, 200, t.body);
      return JSON.parse(t.body);
    };
    const renew = (refreshToken) =>
      go('POST', '/oauth/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      });
    const live = async () => {
      await admin();
      return db.query(
        `select id, redirect_host, refresh_expires_at, ends_at, created_at from public.api_tokens
         where user_id = $1 and client_id = $2 and deleted_at is null`,
        [A, clientId],
      );
    };

    it('the connection records where it goes, readable by its owner', async () => {
      await connect();
      await as(A);
      const row = await one(
        `select redirect_host, refresh_expires_at > now() + interval '29 days' as month
         from public.api_tokens where client_id is not null and deleted_at is null`,
      );
      assert.equal(row.redirect_host, 'claude.ai');
      assert.equal(row.month, true);
    });

    it('a refresh token works once: used again, the connection ends', async () => {
      const first = await connect();
      const r = await renew(first.refresh_token);
      assert.equal(r.status, 200, r.body);
      const second = JSON.parse(r.body);
      // The replaced refresh token comes back (a copy someone kept): everything stops.
      const replay = await renew(first.refresh_token);
      assert.equal(JSON.parse(replay.body).error, 'invalid_grant');
      assert.equal((await live()).rows.length, 0);
      assert.equal(JSON.parse((await renew(second.refresh_token)).body).error, 'invalid_grant');
      const me = await api({
        method: 'GET',
        path: '/v1/me',
        headers: { authorization: `Bearer ${second.access_token}` },
      });
      assert.equal(me.status, 401);
    });

    it('30 days without use, or 90 days after the sign-in, the connection ends', async () => {
      let t = await connect();
      let [row] = (await live()).rows;
      await db.query(
        `update public.api_tokens set refresh_expires_at = now() - interval '1 minute' where id = $1`,
        [row.id],
      );
      assert.match(JSON.parse((await renew(t.refresh_token)).body).error_description, /expired/);
      assert.equal((await live()).rows.length, 0);

      t = await connect();
      [row] = (await live()).rows;
      // 90 days after the sign-in.
      assert.ok(
        Math.abs((new Date(row.ends_at) - new Date(row.created_at)) / 86400000 - 90) < 0.01,
      );
      // Used every week, but the 90 days are over.
      await db.query(
        `update public.api_tokens set ends_at = now() - interval '1 minute' where id = $1`,
        [row.id],
      );
      assert.equal(JSON.parse((await renew(t.refresh_token)).body).error, 'invalid_grant');

      // 5 days before the end: the new tokens stop then, not 7 or 30 days later.
      t = await connect();
      [row] = (await live()).rows;
      await db.query(
        `update public.api_tokens set ends_at = now() + interval '5 days' where id = $1`,
        [row.id],
      );
      const r = JSON.parse((await renew(t.refresh_token)).body);
      assert.ok(r.expires_in <= 5 * 86400 + 5 && r.expires_in > 4 * 86400, String(r.expires_in));
      const [after] = (await live()).rows;
      assert.equal(new Date(after.refresh_expires_at).getTime(), new Date(after.ends_at).getTime());
    });

    it('a connection made by the previous server (no dates) keeps working and gets its dates', async () => {
      const t = await connect();
      const [row] = (await live()).rows;
      await db.query(
        `update public.api_tokens set refresh_expires_at = null, ends_at = null where id = $1`,
        [row.id],
      );
      assert.equal((await renew(t.refresh_token)).status, 200);
      const [after] = (await live()).rows;
      assert.ok(after.refresh_expires_at && after.ends_at);
    });
  });
});

describe('deleted rows are purged after a week (purge_deleted, DECISIONS 78)', () => {
  const ids = {
    used: '78000000-0000-0000-0000-000000000001',
    unused: '78000000-0000-0000-0000-000000000002',
    session: '78000000-0000-0000-0000-000000000003',
    oldWater: '78000000-0000-0000-0000-000000000004',
    newWater: '78000000-0000-0000-0000-000000000005',
    photo: '78000000-0000-0000-0000-000000000006',
    catalogue: '78000000-0000-0000-0000-000000000007',
    deadSession: '78000000-0000-0000-0000-000000000008',
  };

  it('users cannot run it', async () => {
    await as(B);
    await rejects('select public.purge_deleted(7)', '42501');
  });

  it('removes rows deleted 7+ days ago with their files; keeps used, recent and catalogue rows', async () => {
    await admin();
    await db.exec(`
      insert into public.exercises (id, name, primary_muscle, equipment, owner_id, deleted_at) values
        ('${ids.used}', 'Used move', 'back', 'cables', '${B}', now() - interval '30 days'),
        ('${ids.unused}', 'Unused move', 'back', 'cables', '${B}', now() - interval '30 days'),
        ('${ids.catalogue}', 'Old catalogue move', 'back', 'cables', null, now() - interval '30 days');
      insert into public.workout_sessions (id, user_id, started_at, status, deleted_at) values
        ('${ids.session}', '${B}', now() - interval '40 days', 'done', null),
        ('${ids.deadSession}', '${B}', now() - interval '40 days', 'done', now() - interval '9 days');
      insert into public.session_sets (user_id, session_id, exercise_id, set_index, weight_kg, reps, completed_at) values
        ('${B}', '${ids.session}', '${ids.used}', 0, 50, 5, now()),
        ('${B}', '${ids.deadSession}', '${ids.used}', 0, 50, 5, now());
      insert into public.water_logs (id, user_id, day, ml, deleted_at) values
        ('${ids.oldWater}', '${B}', '2026-09-01', 250, now() - interval '8 days'),
        ('${ids.newWater}', '${B}', '2026-10-01', 250, now() - interval '1 day');
      insert into public.progress_photos (id, user_id, day, pose, storage_path, deleted_at) values
        ('${ids.photo}', '${B}', '2026-09-01', 'front', '${B}/gone.jpg', now() - interval '10 days');
    `);
    const out = (await one('select public.purge_deleted(7) as out')).out;
    const exists = async (table, id) =>
      (await count(`select count(*) as n from public.${table} where id = '${id}'`)) === 1;
    assert.equal(await exists('water_logs', ids.oldWater), false);
    assert.equal(await exists('water_logs', ids.newWater), true);
    assert.equal(await exists('progress_photos', ids.photo), false);
    assert.equal(await exists('exercises', ids.unused), false);
    // Still in a live workout: kept (counted as kept, no error).
    assert.equal(await exists('exercises', ids.used), true);
    assert.ok(out.kept >= 1);
    assert.equal(await exists('exercises', ids.catalogue), true);
    // The deleted workout goes with its sets (cascade).
    assert.equal(await exists('workout_sessions', ids.deadSession), false);
    assert.equal(
      await count(
        `select count(*) as n from public.session_sets where session_id = '${ids.deadSession}'`,
      ),
      0,
    );
    assert.deepEqual(
      out.files.filter((f) => f.path.startsWith(B)),
      [{ bucket: 'progress-photos', path: `${B}/gone.jpg` }],
    );
    // The other devices learn it from a tombstone (id only).
    assert.equal(
      await count(
        `select count(*) as n from public.sync_tombstones where table_name = 'water_logs' and row_id = '${ids.oldWater}'`,
      ),
      1,
    );
  });

  it('tombstones and sealed deletions go after 90 days', async () => {
    await admin();
    await db.exec(`
      insert into public.sync_tombstones (user_id, table_name, row_id, server_at) values
        ('${B}', 'water_logs', 'old-one', now() - interval '91 days'),
        ('${B}', 'water_logs', 'new-one', now() - interval '10 days');
    `);
    await db.query('select public.purge_deleted(7)');
    const left = (
      await db.query(
        `select row_id from public.sync_tombstones where row_id in ('old-one', 'new-one')`,
      )
    ).rows.map((r) => r.row_id);
    assert.deepEqual(left, ['new-one']);
  });
});

describe('the deletion log survives a restore (deleted_accounts, DECISIONS 79)', () => {
  const GONE = '79000000-0000-0000-0000-000000000001';

  it('every deleted account is logged (id and time only), closed to users', async () => {
    await admin();
    await db.exec(`
      insert into auth.users (id, instance_id, aud, role, email)
        values ('${GONE}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gone@test.dev');
      insert into public.water_logs (user_id, day, ml) values ('${GONE}', '2026-10-01', 250);
      delete from auth.users where id = '${GONE}';
    `);
    assert.equal(
      await count(`select count(*) as n from public.deleted_accounts where user_id = '${GONE}'`),
      1,
    );
    await as(A);
    await rejects('select * from public.deleted_accounts', '42501');
    await rejects(`select public.reapply_deletions(array['${GONE}'::uuid])`, '42501');
  });

  it('after a restore, the accounts deleted since the dump are deleted again', async () => {
    await admin();
    // The restored dump still has the account and its data.
    await db.exec(`
      insert into auth.users (id, instance_id, aud, role, email)
        values ('${GONE}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gone@test.dev');
      insert into public.water_logs (user_id, day, ml) values ('${GONE}', '2026-10-01', 250);
      delete from public.deleted_accounts where user_id = '${GONE}';
    `);
    const n = (
      await one(
        `select public.reapply_deletions(array['${GONE}'::uuid, '79000000-0000-0000-0000-000000000099'::uuid]) as n`,
      )
    ).n;
    // One of the two was back in the restored dump.
    assert.equal(n, 1);
    assert.equal(
      await count(`select count(*) as n from public.water_logs where user_id = '${GONE}'`),
      0,
    );
    assert.equal(
      await count(`select count(*) as n from public.deleted_accounts where user_id = '${GONE}'`),
      1,
    );
  });

  it('the deletion log file: ids from JSON rows, plain ids or lines; the rest is ignored', () => {
    assert.deepEqual(idsOf(JSON.stringify([{ user_id: GONE }, { user_id: 'x' }])), [GONE]);
    assert.deepEqual(idsOf(`${GONE}\nnot-an-id\n`), [GONE]);
  });

  it('backups: daily for 30 days, then one a month for 6 months', () => {
    const now = new Date('2026-10-18T03:00:00Z');
    const key = (d) => `db/${d}T03-00-00Z.sql.gz.enc`;
    const keys = [
      key('2026-10-01'), // daily, 17 days
      key('2026-09-02'), // 46 days, first of its month in the list
      key('2026-09-03'), // 45 days, not the first: goes
      key('2026-04-01'), // 200 days: older than 6 months, goes
    ];
    assert.deepEqual(
      dumpsToDelete(keys, now).sort(),
      [key('2026-04-01'), key('2026-09-03')].sort(),
    );
  });
});

describe('sign-in limits of the AI app sign-in (DECISIONS 76)', () => {
  it('the caller address is the last X-Forwarded-For hop (the one the proxy added)', () => {
    assert.equal(clientIp('6.6.6.6, 1.2.3.4', '10.0.0.1'), '1.2.3.4');
    assert.equal(clientIp('1.2.3.4'), '1.2.3.4');
    assert.equal(clientIp(undefined, '10.0.0.1'), '10.0.0.1');
    assert.equal(clientIp('', '10.0.0.1'), '10.0.0.1');
  });

  it('5 wrong passwords for one email lock it for 15 minutes, from any address', async () => {
    let checks = 0;
    const oauth = createOAuth({
      sql: async (text, params) => {
        await admin();
        return (await db.query(text, params)).rows;
      },
      signIn: async (email, password) => {
        checks += 1;
        return password === 'right' && email === 'a@test.dev' ? A : null;
      },
      base: 'https://api.test',
    });
    const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
    const reg = await oauth({
      method: 'POST',
      path: '/oauth/register',
      body: { redirect_uris: [REDIRECT], client_name: 'Claude' },
      query: {},
      headers: {},
      ip: '4.4.4.4',
    });
    const clientId = JSON.parse(reg.body).client_id;
    let n = 0;
    const attempt = (email, password) =>
      oauth({
        method: 'POST',
        path: '/oauth/authorize',
        body: {
          client_id: clientId,
          redirect_uri: REDIRECT,
          code_challenge: 'c'.repeat(43),
          email,
          password,
        },
        query: {},
        headers: {},
        // A new address every time: the limit per address does not help here.
        ip: `4.4.5.${(n += 1)}`,
      });
    for (let i = 0; i < 5; i += 1)
      assert.match((await attempt('A@test.dev ', `guess${i}`)).body, /Wrong email or password/);
    const locked = await attempt('a@test.dev', 'right');
    assert.equal(locked.status, 400);
    assert.match(locked.body, /Too many wrong passwords for this email/);
    assert.equal(checks, 5, 'a locked email is not even checked');
    // Another email is not affected; the same answer for an unknown one.
    assert.match((await attempt('nobody@test.dev', 'x')).body, /Wrong email or password/);
  });

  it('health data consent withdrawn: an AI app gets no code (DECISIONS 80)', async () => {
    const oauth = createOAuth({
      sql: async (text, params) => {
        await admin();
        return (await db.query(text, params)).rows;
      },
      signIn: async (email, password) => (password === 'right' ? B : null),
      base: 'https://api.test',
    });
    const REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';
    const reg = await oauth({
      method: 'POST',
      path: '/oauth/register',
      body: { redirect_uris: [REDIRECT], client_name: 'ChatGPT' },
      query: {},
      headers: {},
      ip: '4.4.6.1',
    });
    const attempt = () =>
      oauth({
        method: 'POST',
        path: '/oauth/authorize',
        body: {
          client_id: JSON.parse(reg.body).client_id,
          redirect_uri: REDIRECT,
          code_challenge: 'c'.repeat(43),
          email: 'b@test.dev',
          password: 'right',
        },
        query: {},
        headers: {},
        ip: '4.4.6.2',
      });
    await as(B);
    await db.exec('select public.set_health_consent(false)');
    const refused = await attempt();
    assert.equal(refused.status, 400);
    assert.match(refused.body, /withdrew your consent/);
    await as(B);
    await db.exec('select public.set_health_consent(true)');
    assert.equal((await attempt()).status, 302);
  });
});

describe('security headers of the web app and the site (nginx, DECISIONS 77)', () => {
  const root = path.join(supabaseDir, '..');
  for (const dir of ['web', 'site']) {
    it(`${dir}: every location keeps the security headers`, () => {
      const conf = fs.readFileSync(path.join(root, dir, 'nginx.conf'), 'utf8');
      const snippet = fs.readFileSync(path.join(root, dir, 'security-headers.conf'), 'utf8');
      for (const h of [
        'Content-Security-Policy',
        "frame-ancestors 'none'",
        'X-Frame-Options DENY',
        'X-Content-Type-Options nosniff',
        'Referrer-Policy',
        'Strict-Transport-Security',
      ])
        assert.ok(snippet.includes(h), `${dir}: ${h}`);
      assert.match(conf, /^\s{2}include \/etc\/nginx\/snippets\/security-headers\.conf;/m);
      // A location with its own add_header drops the server's: it must include the snippet too.
      const locations = conf.split(/\n\s*location /).slice(1);
      assert.ok(locations.length > 0);
      for (const block of locations) {
        const body = block.slice(0, block.indexOf('}') + 1);
        if (/add_header/.test(body))
          assert.ok(
            body.includes('security-headers.conf'),
            `${dir}: location ${body.split('{')[0]}`,
          );
      }
      const docker = fs.readFileSync(path.join(root, dir, 'Dockerfile'), 'utf8');
      assert.match(docker, /security-headers\.conf \/etc\/nginx\/snippets\/security-headers\.conf/);
    });
  }

  it('web: the only inline script of the Expo export is allowed by its hash', () => {
    const snippet = fs.readFileSync(path.join(root, 'web', 'security-headers.conf'), 'utf8');
    const hash = createHash('sha256')
      .update('globalThis.__EXPO_ROUTER_HYDRATE__=true;')
      .digest('base64');
    assert.ok(snippet.includes(`'sha256-${hash}'`));
    assert.ok(!/unsafe-eval/.test(snippet));
  });

  it('site: no inline script (its CSP allows scripts from the site only)', () => {
    for (const f of fs.readdirSync(path.join(root, 'site')).filter((x) => x.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(root, 'site', f), 'utf8');
      for (const tag of html.match(/<script[^>]*>/g) ?? [])
        assert.match(tag, /\ssrc=/, `${f}: ${tag}`);
      assert.ok(!/\son[a-z]+="/i.test(html), `${f}: inline event handler`);
    }
  });
});

describe('publishing the APK with its own token (server/apk.js, DECISIONS 75)', () => {
  const TOKEN = 'apk_' + 'k'.repeat(60);
  const BUILD = '0f3c2a1b-1234-4abc-8def-0123456789ab';
  const URL_OK = 'https://expo.dev/artifacts/eas/abcDEF123456.apk';
  const apk = Buffer.concat([Buffer.from('PK\x03\x04', 'binary'), Buffer.alloc(2048)]);
  /** A fake network: EAS, and a storage that remembers what was uploaded. */
  const network = () => {
    const stored = {};
    const calls = [];
    const fetch = async (url, init = {}) => {
      calls.push({ url, init });
      if (url === URL_OK) return new Response(apk, { status: 200 });
      if (url.endsWith('/object/public/downloads/config.js'))
        return stored['config.js']
          ? new Response(stored['config.js'])
          : new Response('', { status: 404 });
      const m = /\/storage\/v1\/object\/downloads\/(.+)$/.exec(url);
      if (m) {
        assert.equal(init.headers.authorization, 'Bearer service');
        stored[m[1]] = typeof init.body === 'string' ? init.body : Buffer.from(init.body);
        return new Response('{}', { status: 200 });
      }
      if (url.endsWith('/storage/v1/bucket')) return new Response('{}', { status: 409 });
      throw new Error(`unexpected fetch ${url}`);
    };
    return { stored, calls, fetch };
  };
  const make = (net, tokenSha256 = createHash('sha256').update(TOKEN).digest('hex')) =>
    createApkPublisher({
      tokenSha256,
      supabaseUrl: 'https://backend.test',
      serviceKey: 'service',
      fetch: net.fetch,
    });
  const body = { build_id: BUILD, build_url: URL_OK, version: '1.0.0' };
  const auth = { authorization: `Bearer ${TOKEN}` };

  it('off without its variable; the token is required', async () => {
    const net = network();
    assert.equal((await make(net, '')({ headers: auth, body })).status, 404);
    assert.equal((await make(net)({ headers: {}, body })).status, 401);
    assert.equal(
      (await make(net)({ headers: { authorization: 'Bearer wrong' }, body })).status,
      401,
    );
    assert.equal(net.calls.length, 0);
  });

  it('fetches only EAS artifacts and checks it is an APK', async () => {
    const net = network();
    const pub = make(net);
    for (const build_url of [
      'https://evil.test/x.apk',
      'https://expo.dev.evil.test/artifacts/eas/abcDEF123456.apk',
      'http://expo.dev/artifacts/eas/abcDEF123456.apk',
      'https://expo.dev/artifacts/eas/../../x.apk',
    ])
      assert.equal(
        (await pub({ headers: auth, body: { ...body, build_url } })).status,
        400,
        build_url,
      );
    assert.equal((await pub({ headers: auth, body: { ...body, build_id: 'x' } })).status, 400);
    assert.equal(net.calls.length, 0);
  });

  it('publishes the APK and its description once', async () => {
    const net = network();
    const pub = make(net);
    const r = await pub({ headers: auth, body });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.published, true);
    assert.equal(net.stored['fft.apk'].length, apk.length);
    assert.match(net.stored['config.js'], new RegExp(BUILD));
    assert.match(net.stored['config.js'], /"url":"\/fft\.apk"/);
    const again = await pub({ headers: auth, body });
    assert.equal(again.body.published, false);
  });
});

describe('food logs of products only on the phone', () => {
  it('sync keeps the log (values copied in it) and drops the link to the unknown product', async () => {
    await as(A);
    const row = {
      id: 'f00d0000-0000-4000-8000-000000000001',
      user_id: A,
      day: '2026-10-15',
      meal: 'breakfast',
      food_id: 'f00d0000-0000-4000-8000-0000000000ff',
      name: 'Fusilli No. 34',
      grams: 100,
      kcal: 351,
      protein_g: 12,
      carbs_g: 70,
      fat_g: 1.5,
      updated_at: '2026-10-15T07:30:00.000Z',
    };
    await db.query(`select public.sync_push('food_logs', $1::jsonb, '[]'::jsonb)`, [
      JSON.stringify([row]),
    ]);
    const saved = await one(`select name, food_id, kcal from public.food_logs where id = $1`, [
      row.id,
    ]);
    assert.equal(saved.name, 'Fusilli No. 34');
    assert.equal(saved.food_id, null);
    assert.equal(Number(saved.kcal), 351);
  });
});

describe('check sync (sync_counts)', () => {
  it('counts only the caller rows that are not deleted, per synced table', async () => {
    await as(A);
    const mine = (await one('select public.sync_counts() as c')).c;
    assert.equal(mine.profiles, 1);
    assert.equal(
      Number(mine.food_logs),
      await count(`select count(*) as n from public.food_logs where deleted_at is null`),
    );
    await as(B);
    const theirs = (await one('select public.sync_counts() as c')).c;
    assert.equal(theirs.profiles, 1);
    assert.ok(Number(theirs.food_logs) < Number(mine.food_logs) || Number(mine.food_logs) === 0);
    await admin();
    await rejects(`set role anon; select public.sync_counts()`, '42501');
  });
});

describe('forgot password (request_password_reset)', () => {
  it('anyone can ask; three a day per email; users cannot read the requests', async () => {
    await admin();
    await db.exec('set role anon');
    for (let i = 0; i < 5; i++)
      await db.query(`select public.request_password_reset($1, $2)`, [' Lost@Example.com ', 'hi']);
    await rejects(`select public.request_password_reset('not an email')`, '22023');
    await as(A);
    await rejects(`select * from public.password_reset_requests`, '42501');
    await admin();
    const r = await one(
      `select count(*) as n, min(email) as email, min(note) as note
       from public.password_reset_requests where email = 'lost@example.com'`,
    );
    assert.equal(Number(r.n), 3);
    assert.equal(r.email, 'lost@example.com');
    assert.equal(r.note, 'hi');
  });

  it('the requests for an account’s email go when the account is deleted (DECISIONS 81)', async () => {
    const GONE = '81000000-0000-0000-0000-000000000001';
    await admin();
    await db.exec('set role anon');
    await db.query(`select public.request_password_reset('Leaving@Example.com', 'my note')`);
    await db.query(`select public.request_password_reset('staying@example.com')`);
    await admin();
    await db.exec(`
      insert into auth.users (id, instance_id, aud, role, email)
        values ('${GONE}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leaving@example.com');
      delete from auth.users where id = '${GONE}';
    `);
    const left = (
      await db.query(
        `select email from public.password_reset_requests where email in ('leaving@example.com', 'staying@example.com')`,
      )
    ).rows.map((r) => r.email);
    assert.deepEqual(left, ['staying@example.com']);
  });
});

describe('error reporting (report_error)', () => {
  it('anyone can report; the same problem gets the same fingerprint; users cannot read them', async () => {
    await as(A);
    await db.query(
      `select public.report_error('crash', 'TypeError: x of 12 is undefined', 'at a (b.js:1:200)')`,
    );
    await db.query(
      `select public.report_error('crash', 'TypeError: x of 34 is undefined', 'at a (b.js:1:999)')`,
    );
    await rejects(`select * from public.app_errors`, '42501');
    await admin();
    await db.exec('set role anon');
    await db.query(`select public.report_error('render', 'boom')`);
    await admin();
    const groups = await db.query(
      `select fingerprint, count(*) as n, count(user_id) as users from public.app_errors group by 1 order by 2 desc`,
    );
    assert.equal(groups.rows.length, 2);
    assert.equal(Number(groups.rows[0].n), 2);
    assert.equal(Number(groups.rows[0].users), 2);
    assert.equal(Number(groups.rows[1].users), 0);
  });
});

describe('drop sets (drop_index)', () => {
  it('drops count in volume only: never the max, the 1RM or the set count', async () => {
    await as(B);
    await db.exec(`
      insert into public.workout_sessions (id, started_at, status) values
        ('77777777-0000-0000-0000-000000000001', '2026-10-12 10:00+00', 'done');
      insert into public.session_sets (session_id, exercise_id, set_index, drop_index, weight_kg, reps, completed_at)
      select '77777777-0000-0000-0000-000000000001', e.id, 0, d.k, d.kg, d.reps, now()
      from (values (0, 50, 8), (1, 90, 10)) as d(k, kg, reps)
      join public.exercises e on e.slug = 'pec-deck' and e.owner_id is null;
    `);
    const r = await one(`
      select r.actual_max_kg, r.completed_sets from public.exercise_records r
      join public.exercises e on e.id = r.exercise_id where e.slug = 'pec-deck'`);
    assert.equal(Number(r.actual_max_kg), 50);
    assert.equal(Number(r.completed_sets), 1);
    const d = await one(`
      select v.sets, v.volume_kg from public.exercise_e1rm_daily v
      join public.exercises e on e.id = v.exercise_id where e.slug = 'pec-deck'`);
    assert.equal(Number(d.sets), 1);
    assert.equal(Number(d.volume_kg), 50 * 8 + 90 * 10);
    const last = await db.query(
      `select drop_index from public.last_sets(array(select id from public.exercises where slug = 'pec-deck' and owner_id is null))`,
    );
    assert.deepEqual(
      last.rows.map((x) => Number(x.drop_index)),
      [0, 1],
    );
  });
});

describe('keep a copy on the server is optional (DECISIONS 62)', () => {
  // A new account (made after the migration): it has not chosen yet.
  const D = 'eeeeeeee-0000-0000-0000-00000000000e';
  const W = '88888888-0000-0000-0000-000000000001';
  const api = createApi({
    tokenFor,
    async asUser(uid, fn) {
      await as(uid);
      return fn(async (sql, params) => (await db.query(sql, params)).rows);
    },
  });
  const oauth = createOAuth({
    sql: async (text, params) => {
      await admin();
      return (await db.query(text, params)).rows;
    },
    signIn: async (email, password) => (password === 'right' && email === 'd@test.dev' ? D : null),
    base: 'https://api.test',
  });
  let token = '';
  const me = (t = token) =>
    api({ method: 'GET', path: '/v1/me', headers: { authorization: `Bearer ${t}` } });

  before(async () => {
    await admin();
    await db.exec(`
      insert into auth.users (id, instance_id, aud, role, email) values
        ('${D}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@test.dev');
    `);
  });

  it('a new account has not chosen: nothing of its data can be stored online', async () => {
    await as(D);
    assert.equal((await one('select public.my_sync() as s')).s, null);
    assert.equal((await one('select public.is_premium() as p')).p, false);
    await rejects(`insert into public.water_logs (day, ml) values ('2026-10-17', 250)`, '42501');
    await rejects(
      `select public.sync_push('water_logs', '[{"id": "${W}", "user_id": "${D}", "day": "2026-10-17", "ml": 250, "updated_at": "2026-10-17T10:00:00Z"}]'::jsonb, '[]'::jsonb)`,
      '42501',
    );
    await rejects(
      `insert into storage.objects (bucket_id, name) values ('progress-photos', '${D}/a.jpg')`,
      '42501',
    );
  });

  it('the choice is changed only through set_sync, and only by a signed-in user', async () => {
    await as(D);
    await rejects(
      `insert into public.account_sync (user_id, enabled) values ('${D}', true)`,
      '42501',
    );
    await admin();
    await db.exec('set role anon');
    await rejects('select public.set_sync(true)', '42501');
    await rejects(`select public.sync_enabled_of('${D}')`, '42501');
  });

  it('on: the data goes online, a token can be made and works', async () => {
    await as(D);
    await db.exec('select public.set_sync(true)');
    assert.equal((await one('select public.my_sync() as s')).s, true);
    await db.exec(`
      insert into public.water_logs (id, day, ml) values ('${W}', '2026-10-17', 250);
      insert into public.body_metrics (day, weight_kg) values ('2026-10-17', 70);
      insert into storage.objects (bucket_id, name) values ('progress-photos', '${D}/a.jpg');
      update public.profiles set name = 'Dee';
    `);
    token = (await one(`select public.create_api_token('Claude') as t`)).t;
    assert.equal((await me()).status, 200);
    // Another user cannot read the choice.
    await as(A);
    assert.equal(
      await count(`select count(*) as n from public.account_sync where user_id = '${D}'`),
      0,
    );
  });

  it('off: the server copy is deleted, the account stays, nothing more can be stored', async () => {
    await admin();
    const others = await count(
      `select count(*) as n from public.body_metrics where user_id <> '${D}'`,
    );
    await as(D);
    await db.exec('select public.set_sync(false)');
    assert.equal((await one('select public.my_sync() as s')).s, false);
    assert.equal(await count('select count(*) as n from public.water_logs'), 0);
    assert.equal(await count('select count(*) as n from public.body_metrics'), 0);
    assert.equal(await count('select count(*) as n from public.sync_tombstones'), 0);
    const p = await one('select name, extract(year from updated_at) as y from public.profiles');
    assert.equal(p.name, null, 'the empty profile every account has stays');
    // Older than any change of a device: turned on again, the device's rows win.
    assert.equal(Number(p.y), 1970);
    assert.equal(await count('select count(*) as n from public.user_settings'), 1);
    await rejects(`insert into public.water_logs (day, ml) values ('2026-10-17', 300)`, '42501');
    await rejects(
      `insert into storage.objects (bucket_id, name) values ('progress-photos', '${D}/b.jpg')`,
      '42501',
    );
    await admin();
    assert.equal(
      await count(`select count(*) as n from public.body_metrics where user_id <> '${D}'`),
      others,
    );
    assert.equal(await count(`select count(*) as n from auth.users where id = '${D}'`), 1);
  });

  it('off: the API, MCP and making a token refuse, with a clear message', async () => {
    const rest = await me();
    assert.equal(rest.status, 403);
    assert.match(rest.body.error, /Keep a copy on the server is off/);
    const mcp = await api({
      method: 'POST',
      path: '/mcp',
      headers: { authorization: `Bearer ${token}` },
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    assert.equal(mcp.status, 403);
    await as(D);
    await rejects(`select public.create_api_token('again')`, '55000');
  });

  it('off: the sign-in for AI apps says why it cannot connect', async () => {
    const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
    const reg = await oauth({
      method: 'POST',
      path: '/oauth/register',
      body: { redirect_uris: [REDIRECT], client_name: 'Claude' },
      query: {},
      headers: {},
      ip: '5.6.7.8',
    });
    const res = await oauth({
      method: 'POST',
      path: '/oauth/authorize',
      body: {
        client_id: JSON.parse(reg.body).client_id,
        redirect_uri: REDIRECT,
        state: 's',
        code_challenge: 'c'.repeat(43),
        code_challenge_method: 'S256',
        email: 'd@test.dev',
        password: 'right',
      },
      query: {},
      headers: {},
      ip: '5.6.7.8',
    });
    assert.equal(res.status, 400, 'no code: the sign-in page again, with the reason');
    assert.match(res.body, /kept only on your phone/);
  });

  it('on again: the phone sends its rows and they win over the empty ones', async () => {
    await as(D);
    await db.exec('select public.set_sync(true)');
    await db.exec(
      `select public.sync_push('profiles', '[{"id": "${D}", "name": "Dee", "updated_at": "2026-10-17T10:00:00Z"}]'::jsonb, '[]'::jsonb)`,
    );
    assert.equal((await one('select name from public.profiles')).name, 'Dee');
    assert.equal((await me()).status, 200);
  });
});

describe('the copy on the server by category (DECISIONS 63)', () => {
  const F = 'ffffffff-0000-0000-0000-00000000000f';
  const W = '88888888-0000-0000-0000-0000000000f1';
  const api = createApi({
    tokenFor,
    async asUser(uid, fn) {
      await as(uid);
      return fn(async (sql, params) => (await db.query(sql, params)).rows);
    },
  });
  let token = '';
  const call = (method, path, body) =>
    api({ method, path, query: {}, body, headers: { authorization: `Bearer ${token}` } });
  const tool = async (name, args = {}) => call('POST', `/v1/tools/${name}`, args);

  before(async () => {
    await admin();
    await db.exec(`
      insert into auth.users (id, instance_id, aud, role, email) values
        ('${F}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f@test.dev');
    `);
    await as(F);
    await db.exec('select public.set_sync(true)');
    await db.exec(`
      insert into public.water_logs (id, day, ml) values ('${W}', '2026-10-17', 250);
      insert into public.food_logs (day, meal, name, kcal) values ('2026-10-17', 'lunch', 'Pasta', 600);
      insert into public.body_metrics (day, weight_kg) values ('2026-10-17', 70);
      insert into storage.objects (bucket_id, name) values ('progress-photos', '${F}/a.jpg');
    `);
    token = (await one(`select public.create_api_token('Claude') as t`)).t;
  });

  it('every category is kept by default (accounts that already had a copy keep everything)', async () => {
    await as(F);
    const state = (await one('select public.my_sync_state() as s')).s;
    assert.equal(state.enabled, true);
    assert.deepEqual(state.categories, ['body', 'diet', 'training', 'photos']);
    await as(A);
    assert.deepEqual((await one('select public.my_sync_state() as s')).s.categories, [
      'body',
      'diet',
      'training',
      'photos',
    ]);
  });

  it('a category turned off is deleted from the server, with no tombstones; the rest stays', async () => {
    await as(F);
    const kept = (
      await one(`select public.set_sync_categories(array['photos', 'body', 'training']) as c`)
    ).c;
    assert.deepEqual(kept, ['body', 'training', 'photos']);
    assert.equal(await count('select count(*) as n from public.water_logs'), 0);
    assert.equal(await count('select count(*) as n from public.food_logs'), 0);
    assert.equal(await count('select count(*) as n from public.body_metrics'), 1);
    assert.equal(
      await count(
        `select count(*) as n from public.sync_tombstones where table_name in ('water_logs', 'food_logs')`,
      ),
      0,
      'other devices must not delete their own copy',
    );
    await admin();
    assert.equal(
      (await count(`select count(*) as n from public.water_logs where user_id <> '${F}'`)) > 0,
      true,
      'other accounts keep theirs',
    );
  });

  it('writes of a category that is off are refused, also through sync_push (an old app)', async () => {
    await as(F);
    await rejects(`insert into public.water_logs (day, ml) values ('2026-10-17', 300)`, '42501');
    await rejects(
      `select public.sync_push('water_logs', '[{"id": "${W}", "user_id": "${F}", "day": "2026-10-17", "ml": 250, "updated_at": "2026-10-17T10:00:00Z"}]'::jsonb, '[]'::jsonb)`,
      '42501',
    );
    await db.exec(`insert into public.body_metrics (day, weight_kg) values ('2026-10-18', 71)`);
    await db.exec(`select public.set_sync_categories(array['body', 'diet', 'training'])`);
    await rejects(
      `insert into storage.objects (bucket_id, name) values ('progress-photos', '${F}/b.jpg')`,
      '42501',
    );
    assert.equal(await count('select count(*) as n from public.progress_photos'), 0);
    await db.exec(`select public.set_sync_categories(array['body', 'training', 'photos'])`);
  });

  it('only known categories; only a signed-in user', async () => {
    await as(F);
    await rejects(`select public.set_sync_categories(array['diet', 'secrets'])`, '22023');
    await admin();
    await db.exec('set role anon');
    await rejects(`select public.set_sync_categories(array['diet'])`, '42501');
    await rejects(`select public.sync_categories_of('${F}')`, '42501');
  });

  it('the API and MCP say a category is not shared; mixed answers leave it out', async () => {
    const water = await call('GET', '/v1/water');
    assert.equal(water.status, 403);
    assert.match(water.body.error, /^Diet is not shared with the server/);
    assert.equal((await tool('log_food', { meal: 'lunch', name: 'x', kcal: 1 })).status, 403);
    const q = await tool('query_data', { table: 'food_logs' });
    assert.equal(q.status, 403);
    assert.equal((await tool('query_data', { table: 'body_metrics' })).status, 200);
    const day = await call('GET', '/v1/days/2026-10-17');
    assert.equal(day.status, 200);
    assert.equal(day.body.food_logs, undefined);
    assert.ok(day.body.body);
    assert.match(day.body.not_shared, /Diet/);
    const map = await tool('list_data');
    assert.equal(
      map.body.tables.some((t) => t.table === 'water_logs'),
      false,
    );
    const init = await call('POST', '/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    });
    assert.match(init.body.result.instructions, /Not shared with the server.*Diet/);
    const mcp = await call('POST', '/mcp', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_water', arguments: {} },
    });
    assert.equal(mcp.body.result.isError, true);
    assert.match(mcp.body.result.content[0].text, /Diet is not shared/);
  });

  it('turned on again: the category can be stored and the API answers', async () => {
    await as(F);
    await db.exec(`select public.set_sync_categories(array['body', 'diet', 'training', 'photos'])`);
    await db.exec(`insert into public.water_logs (day, ml) values ('2026-10-17', 300)`);
    assert.equal((await call('GET', '/v1/water')).status, 200);
  });
});

describe('end-to-end encryption of the copy on the server (DECISIONS 64)', () => {
  const V = '77777777-0000-0000-0000-000000000007';
  const W = '88888888-0000-0000-0000-000000000077';
  const KEYS = `insert into public.vault_keys (kdf, salt, wrapped_by_passphrase, wrapped_by_recovery, key_check)
    values ('{"alg":"scrypt","N":16384,"r":8,"p":1}', 'c2FsdA==', 'pp', 'rr', 'check')`;
  const api = createApi({
    tokenFor,
    async asUser(uid, fn) {
      await as(uid);
      return fn(async (sql, params) => (await db.query(sql, params)).rows);
    },
  });
  const oauth = createOAuth({
    sql: async (text, params) => {
      await admin();
      return (await db.query(text, params)).rows;
    },
    signIn: async (email, password) => (password === 'right' && email === 'v@test.dev' ? V : null),
    base: 'https://api.test',
  });
  let token = '';
  const push = (rows) => db.exec(`select public.vault_push('${JSON.stringify(rows)}'::jsonb)`);
  const sealed = (id) => one(`select * from public.vault_rows where row_id = '${id}'`);

  before(async () => {
    await admin();
    await db.exec(`
      insert into auth.users (id, instance_id, aud, role, email) values
        ('${V}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'v@test.dev');
    `);
    await as(V);
    await db.exec('select public.set_sync(true)');
    await db.exec(`insert into public.water_logs (id, day, ml) values ('${W}', '2026-10-17', 250)`);
    token = (await one(`select public.create_api_token('Claude') as t`)).t;
  });

  it('no sealed item before the key is set up; the key is the owner’s only', async () => {
    await as(V);
    await rejects(
      `select public.vault_push('[{"tbl": "water_logs", "row_id": "x", "updated_at": "2026-10-17T10:00:00Z", "ciphertext": "abc"}]'::jsonb)`,
      '42501',
    );
    await db.exec(KEYS);
    assert.deepEqual((await one('select public.my_sync_state() as s')).s.vault, true);
    const kept = (await one('select public.my_vault_keys() as k')).k;
    assert.equal(kept.salt, 'c2FsdA==');
    assert.equal(kept.user_id, undefined);
    await as(A);
    assert.equal(await count('select count(*) as n from public.vault_keys'), 0);
    await rejects(
      `insert into public.vault_keys (user_id, kdf, salt, wrapped_by_passphrase, wrapped_by_recovery, key_check)
       values ('${V}', '{}', 's', 'p', 'r', 'c')`,
      '42501',
    );
  });

  it('sealed rows: the newest change wins, the same change twice counts once, deletions win', async () => {
    await as(V);
    const row = (at, extra = {}) => ({
      tbl: 'water_logs',
      row_id: W,
      updated_at: at,
      ciphertext: `sealed-${at}`,
      ...extra,
    });
    await push([row('2026-10-17T10:00:00Z')]);
    await push([row('2026-10-17T09:00:00Z')]); // older, arriving later
    assert.equal((await sealed(W)).ciphertext, 'sealed-2026-10-17T10:00:00Z');
    await push([row('2026-10-17T11:00:00Z')]);
    assert.equal((await sealed(W)).ciphertext, 'sealed-2026-10-17T11:00:00Z');
    await push([row('2026-10-17T10:30:00Z', { deleted: true })]); // deleted before the change
    assert.equal((await sealed(W)).deleted, false);
    await push([row('2026-10-17T11:00:00Z', { deleted: true })]);
    const gone = await sealed(W);
    assert.equal(gone.deleted, true);
    assert.equal(gone.ciphertext, null, 'a deletion keeps nothing of the row');
    await push([row('2026-10-17T12:00:00Z')]);
    assert.equal((await sealed(W)).deleted, false);
    await rejects(
      `select public.vault_push('[{"tbl": "secrets", "row_id": "x", "updated_at": "2026-10-17T10:00:00Z", "ciphertext": "a"}]'::jsonb)`,
      '23514',
    );
    const pulled = (await one(`select public.vault_pull('epoch') as p`)).p;
    assert.equal(pulled.rows.length, 1);
    assert.equal(pulled.rows[0].row_id, W);
    assert.ok(pulled.now);
    assert.deepEqual((await one('select public.vault_counts() as c')).c, { water_logs: 1 });
    await as(A);
    assert.equal(await count('select count(*) as n from public.vault_rows'), 0);
  });

  it('turned on: the readable copy is deleted and refused; sealed items still go', async () => {
    await as(V);
    await db.exec('select public.set_vault(true)');
    assert.equal((await one('select public.my_sync_state() as s')).s.encrypted, true);
    assert.equal(await count('select count(*) as n from public.water_logs'), 0);
    await rejects(`insert into public.water_logs (day, ml) values ('2026-10-17', 300)`, '42501');
    await rejects(
      `select public.sync_push('water_logs', '[{"id": "${W}", "user_id": "${V}", "day": "2026-10-17", "ml": 250, "updated_at": "2026-10-18T10:00:00Z"}]'::jsonb, '[]'::jsonb)`,
      '42501',
    );
    await rejects(
      `insert into storage.objects (bucket_id, name) values ('progress-photos', '${V}/a.jpg')`,
      '42501',
    );
    await push([
      { tbl: 'body_metrics', row_id: 'b1', updated_at: '2026-10-17T10:00:00Z', ciphertext: 'x' },
    ]);
    assert.equal(await count('select count(*) as n from public.vault_rows'), 2);
  });

  it('sealed photos: own folder, a known kind, the category kept', async () => {
    await as(V);
    await db.exec(
      `insert into storage.objects (bucket_id, name) values ('vault-files', '${V}/p-abc')`,
    );
    await rejects(
      `insert into storage.objects (bucket_id, name) values ('vault-files', '${V}/x-abc')`,
      '42501',
    );
    await rejects(
      `insert into storage.objects (bucket_id, name) values ('vault-files', '${A}/p-abc')`,
      '42501',
    );
    await db.exec(`select public.set_sync_categories(array['body', 'diet', 'training'])`);
    await rejects(
      `insert into storage.objects (bucket_id, name) values ('vault-files', '${V}/p-def')`,
      '42501',
    );
    await db.exec(`select public.set_sync_categories(array['diet', 'training', 'photos'])`);
    assert.equal(
      await count(`select count(*) as n from public.vault_rows where tbl = 'body_metrics'`),
      0,
      'a category turned off leaves the sealed copy too',
    );
    await db.exec(`select public.set_sync_categories(array['body', 'diet', 'training', 'photos'])`);
  });

  it('the key of an encrypted copy cannot be replaced; the passphrase wrap can', async () => {
    await as(V);
    await rejects(`update public.vault_keys set key_check = 'other'`, '55000');
    await db.exec(`update public.vault_keys set wrapped_by_passphrase = 'pp2', salt = 'c2FsdDI='`);
    assert.equal((await one('select wrapped_by_passphrase as w from public.vault_keys')).w, 'pp2');
  });

  it('the API, MCP, new tokens and the AI app sign-in say the copy is encrypted', async () => {
    const rest = await api({
      method: 'GET',
      path: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(rest.status, 403);
    assert.match(rest.body.error, /end-to-end encrypted/);
    const mcp = await api({
      method: 'POST',
      path: '/mcp',
      headers: { authorization: `Bearer ${token}` },
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    assert.equal(mcp.status, 403);
    assert.match(mcp.body.error, /end-to-end encrypted/);
    await as(V);
    await rejects(`select public.create_api_token('again')`, '55000');
    const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
    const reg = await oauth({
      method: 'POST',
      path: '/oauth/register',
      body: { redirect_uris: [REDIRECT], client_name: 'Claude' },
      query: {},
      headers: {},
      ip: '9.9.9.9',
    });
    const res = await oauth({
      method: 'POST',
      path: '/oauth/authorize',
      body: {
        client_id: JSON.parse(reg.body).client_id,
        redirect_uri: REDIRECT,
        state: 's',
        code_challenge: 'c'.repeat(43),
        code_challenge_method: 'S256',
        email: 'v@test.dev',
        password: 'right',
      },
      query: {},
      headers: {},
      ip: '9.9.9.9',
    });
    assert.equal(res.status, 400);
    assert.match(res.body, /end-to-end encrypted/);
  });

  it('turned off: readable writes again, then the sealed copy and the key go', async () => {
    await as(V);
    await rejects('select public.clear_vault()', '55000');
    await db.exec('select public.set_vault(false)');
    await db.exec(`insert into public.water_logs (day, ml) values ('2026-10-17', 300)`);
    await db.exec('select public.clear_vault()');
    assert.equal(await count('select count(*) as n from public.vault_rows'), 0);
    assert.equal(await count('select count(*) as n from public.vault_keys'), 0);
    const me = await api({
      method: 'GET',
      path: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(me.status, 200);
  });

  it('turning the whole copy off also deletes the sealed copy and the key', async () => {
    await as(V);
    await db.exec(
      `select public.save_vault_keys('{"kdf": {"alg": "scrypt", "N": 16384, "r": 8, "p": 1}, "salt": "s", "wrapped_by_passphrase": "p", "wrapped_by_recovery": "r", "key_check": "c"}'::jsonb)`,
    );
    await push([
      { tbl: 'water_logs', row_id: 'w9', updated_at: '2026-10-17T10:00:00Z', ciphertext: 'x' },
    ]);
    await db.exec('select public.set_vault(true)');
    await db.exec('select public.set_sync(false)');
    assert.equal(await count('select count(*) as n from public.vault_rows'), 0);
    assert.equal(await count('select count(*) as n from public.vault_keys'), 0);
    assert.equal((await one('select public.my_sync_state() as s')).s.encrypted, false);
    await rejects(`select public.set_vault(true)`, '55000');
    await admin();
    await db.exec('set role anon');
    await rejects('select public.set_vault(true)', '42501');
    await rejects(`select public.vault_on_of('${V}')`, '42501');
  });
});

describe('encrypted relay between phones (DECISIONS 65)', () => {
  const R = '66666666-0000-0000-0000-000000000006';
  const P1 = '11111111-aaaa-4aaa-8aaa-000000000001';
  const P2 = '11111111-aaaa-4aaa-8aaa-000000000002';
  const send = (msgs) => db.exec(`select public.relay_send('${JSON.stringify(msgs)}'::jsonb)`);

  before(async () => {
    await admin();
    await db.exec(`
      insert into auth.users (id, instance_id, aud, role, email) values
        ('${R}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r@test.dev');
    `);
  });

  it('only accounts without a copy on the server can pair phones', async () => {
    await as(R);
    await rejects(`select public.relay_register('${P1}', 'Pixel')`, '42501'); // not chosen yet
    await db.exec('select public.set_sync(true)');
    await rejects(`select public.relay_register('${P1}', 'Pixel')`, '42501');
    await db.exec('select public.set_sync(false)');
    await db.exec(`select public.relay_register('${P1}', 'Pixel')`);
    await db.exec(`select public.relay_register('${P2}', 'Galaxy')`);
    const list = (await one('select public.relay_list() as l')).l;
    assert.deepEqual(
      list.map((d) => d.name),
      ['Pixel', 'Galaxy'],
    );
    await rejects(`select public.relay_register('not-an-id', 'x')`, '23514');
  });

  it('a message goes to a paired phone, is fetched, and is deleted once received', async () => {
    await as(R);
    await send([{ to: P2, from: P1, payload: 'sealed-1' }]);
    await rejects(
      `select public.relay_send('${JSON.stringify([{ to: '22222222-aaaa-4aaa-8aaa-000000000009', from: P1, payload: 'x' }])}'::jsonb)`,
      '42501',
    );
    const inbox = (await one(`select public.relay_fetch('${P2}') as m`)).m;
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].from, P1);
    assert.equal(inbox[0].payload, 'sealed-1');
    assert.equal((await one(`select public.relay_fetch('${P1}') as m`)).m.length, 0);
    await db.exec(`select public.relay_ack('${P2}', array['${inbox[0].id}']::uuid[])`);
    assert.equal(await count('select count(*) as n from public.relay_messages'), 0);
  });

  it('nobody else sees or deletes them', async () => {
    await as(R);
    await send([{ to: P2, from: P1, payload: 'sealed-2' }]);
    await as(A);
    assert.equal(await count('select count(*) as n from public.relay_messages'), 0);
    assert.equal(await count('select count(*) as n from public.relay_devices'), 0);
    await db.exec(`select public.relay_remove('${P2}')`);
    await rejects(`select public.relay_register('${P1}', 'Mine now')`, '42501');
    await as(R);
    assert.equal(await count('select count(*) as n from public.relay_messages'), 1);
  });

  it('size limits: one message at most 8 MB, at most 50 at a time', async () => {
    await as(R);
    const many = Array.from({ length: 51 }, () => ({ to: P2, from: P1, payload: 'x' }));
    await rejects(`select public.relay_send('${JSON.stringify(many)}'::jsonb)`, '54000');
    await rejects(
      `insert into public.relay_messages (to_device, from_device, payload) values ('${P2}', '${P1}', repeat('x', 8000001))`,
      '23514',
    );
  });

  it('unpairing a phone deletes what waited for it; old messages go after 30 days', async () => {
    await as(R);
    await db.exec(`select public.relay_remove('${P2}')`);
    assert.equal(await count('select count(*) as n from public.relay_messages'), 0);
    assert.equal(await count('select count(*) as n from public.relay_devices'), 1);
    await db.exec(`select public.relay_register('${P2}', 'Galaxy')`);
    await send([{ to: P2, from: P1, payload: 'old' }]);
    await admin();
    await db.exec(`update public.relay_messages set created_at = now() - interval '31 days'`);
    // The nightly clean-up of server/index.js.
    await db.exec(
      `delete from public.relay_messages where created_at < now() - interval '30 days'`,
    );
    assert.equal(await count('select count(*) as n from public.relay_messages'), 0);
  });

  it('turning the copy on ends the relay', async () => {
    await as(R);
    await send([{ to: P2, from: P1, payload: 'sealed-3' }]);
    await db.exec('select public.set_sync(true)');
    assert.equal(await count('select count(*) as n from public.relay_messages'), 0);
    assert.equal(await count('select count(*) as n from public.relay_devices'), 0);
    await rejects(`select public.relay_register('${P1}', 'Pixel')`, '42501');
  });
});

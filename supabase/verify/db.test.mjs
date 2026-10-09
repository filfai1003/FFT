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

const here = path.dirname(fileURLToPath(import.meta.url));
const supabaseDir = path.join(here, '..');

const A = 'aaaaaaaa-0000-0000-0000-00000000000a';
const B = 'bbbbbbbb-0000-0000-0000-00000000000b';

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
      ('${B}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.dev');
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
    assert.equal(await count('select count(*) as n from public.profiles'), 2);
    assert.equal(await count('select count(*) as n from public.user_settings'), 2);
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
    await db.exec(`insert into public.vip_users (user_id, note) values ('${A}', 'friend')`);
    await db.exec(`insert into public.admin_audit (action) values ('test')`);
  });

  it('a user sees only their own vip row', async () => {
    await as(A);
    assert.equal(await count('select count(*) as n from public.vip_users'), 1);
    await as(B);
    assert.equal(await count('select count(*) as n from public.vip_users'), 0);
  });

  it('a user cannot make themselves vip, change it or remove it', async () => {
    await as(B);
    await rejects(`insert into public.vip_users (user_id) values ('${B}')`, '42501');
    await as(A);
    const changed = await db.query(`update public.vip_users set note = 'hacked' returning user_id`);
    assert.equal(changed.rows.length, 0);
    const removed = await db.query(`delete from public.vip_users returning user_id`);
    assert.equal(removed.rows.length, 0);
    await admin();
    assert.equal(await count('select count(*) as n from public.vip_users'), 1);
  });

  it('the admin audit is closed to every user', async () => {
    await as(A);
    assert.equal(await count('select count(*) as n from public.admin_audit'), 0);
    await rejects(`insert into public.admin_audit (action) values ('forged')`, '42501');
  });
});

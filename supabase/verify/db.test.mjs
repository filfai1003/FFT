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
import { createOAuth } from '../../server/oauth.js';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const supabaseDir = path.join(here, '..');

const A = 'aaaaaaaa-0000-0000-0000-00000000000a';
const B = 'bbbbbbbb-0000-0000-0000-00000000000b';
// A and B are premium (data online); C is a free account (data on the phone only).
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

describe('only premium accounts keep data on the server', () => {
  it('is_premium() is true for VIP accounts only', async () => {
    await as(A);
    assert.equal((await one('select public.is_premium() as p')).p, true);
    await as(C);
    assert.equal((await one('select public.is_premium() as p')).p, false);
  });

  it('a free account cannot write any data online', async () => {
    await as(C);
    await rejects(
      `insert into public.food_logs (day, meal, name, grams, kcal) values ('2026-10-08', 'lunch', 'x', 1, 1)`,
      '42501',
    );
    await rejects(
      `insert into public.body_metrics (day, weight_kg) values ('2026-10-08', 80)`,
      '42501',
    );
    await rejects(
      `insert into public.exercises (name, primary_muscle, equipment, owner_id)
       values ('Mine', 'back', 'cables', '${C}')`,
      '42501',
    );
    const r = await db.query(`update public.profiles set name = 'C' returning id`);
    assert.equal(r.rows.length, 0, 'not even its own profile');
  });

  it('after premium ends, the data can still be read and deleted (taken back to the phone)', async () => {
    await admin();
    await db.exec(
      `insert into public.water_logs (user_id, day, ml) values ('${C}', '2026-10-08', 250)`,
    );
    await as(C);
    assert.equal(await count('select count(*) as n from public.water_logs'), 1);
    const changed = await db.query('update public.water_logs set ml = 500 returning id');
    assert.equal(changed.rows.length, 0);
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

  it("nobody can push into someone else's data, and free accounts cannot push", async () => {
    await as(B);
    await rejects(
      `select public.sync_push('water_logs', '[{"id":"55555555-0000-0000-0000-000000000002","user_id":"${A}","day":"2026-10-14","ml":1,"updated_at":"2026-10-14T00:00:00Z"}]', '[]')`,
      '42501',
    );
    await as(C);
    await rejects(
      `select public.sync_push('water_logs', '[{"id":"55555555-0000-0000-0000-000000000003","user_id":"${C}","day":"2026-10-14","ml":1,"updated_at":"2026-10-14T00:00:00Z"}]', '[]')`,
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
      insert into public.user_plans (user_id, plan) values ('${S}', 'supporter');
    `);
  });

  it('VIP accounts are premium, others free unless the admin set a plan', async () => {
    await as(A);
    assert.equal((await one('select public.my_plan() as p')).p, 'premium');
    await as(C);
    assert.equal((await one('select public.my_plan() as p')).p, 'free');
    await as(S);
    assert.equal((await one('select public.my_plan() as p')).p, 'supporter');
  });

  it('supporters keep data online too', async () => {
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
    async userForToken(hash) {
      await admin();
      return (await one('select public.api_token_user($1) as u', [hash])).u;
    },
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

  it('free accounts cannot make a token; paid accounts get one, shown once (only its hash is kept)', async () => {
    await as(C);
    await rejects(`select public.create_api_token('mine')`, '42501');
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
            exercises: [{ exercise: 'Barbell bench press', sets: 3, reps: '8-10', rest_s: 120 }],
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
    planOf: async (uid) => {
      await admin();
      return (await one('select public.plan_of($1) as p', [uid])).p;
    },
    base: BASE,
  });
  const api = createApi(
    {
      async userForToken(hash) {
        await admin();
        return (await one('select public.api_token_user($1) as u', [hash])).u;
      },
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

  it('the sign-in page names the app; a wrong password or a free account gets no code', async () => {
    const pageRes = await go('GET', '/oauth/authorize', undefined, {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
    });
    assert.equal(pageRes.status, 200);
    assert.match(pageRes.body, /<b>Claude<\/b> wants to read and change your FFT data/);
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
    assert.match((await authorize('c@test.dev', 'right')).body, /part of Supporter and Premium/);
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
});

import { createLocalClient } from './client';
import { LocalDb, type Kv } from './engine';
import { LOCAL_USER_ID } from './schema';
import { copyLocalData, hasOwnData, moveLocalData } from './index';

function memoryKv(): Kv & { texts: Map<string, string> } {
  const texts = new Map<string, string>();
  const files = new Map<string, Uint8Array>();
  return {
    texts,
    getText: async (k) => texts.get(k) ?? null,
    setText: async (k, v) => void texts.set(k, v),
    putFile: async (k, b) => void files.set(k, b),
    fileUrl: async (k) => (files.has(k) ? `blob:${k}` : null),
    readFile: async (k: string) => files.get(k) ?? null,
    removeFile: async (k) => void files.delete(k),
    clearAll: async () => {
      texts.clear();
      files.clear();
    },
  };
}

const setup = () => {
  const kv = memoryKv();
  const db = new LocalDb(kv, LOCAL_USER_ID);
  return { kv, db, c: createLocalClient(db) };
};

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('offline database', () => {
  it('starts with the exercise catalogue, a profile and settings', async () => {
    const { c } = setup();
    const ex = await c
      .from('exercises')
      .select('id, name, owner_id')
      .is('deleted_at', null)
      .order('name');
    expect((ex.data as unknown[]).length).toBeGreaterThan(60);
    const profile = await c.from('profiles').select('*').eq('id', LOCAL_USER_ID).single();
    expect(profile.error).toBeNull();
    expect(profile.data).toMatchObject({ diet_mode: 'tracking', onboarding_completed_at: null });
    const settings = await c
      .from('user_settings')
      .select('*')
      .eq('user_id', LOCAL_USER_ID)
      .maybeSingle();
    expect(settings.data).toMatchObject({ weight_unit: 'kg', water_glass_ml: 250 });
  });

  it('saves to the device and reads it back', async () => {
    const { kv, db, c } = setup();
    await c.from('water_logs').upsert({ id: id(1), day: '2026-10-09', ml: 250 });
    await db.save();
    const again = createLocalClient(new LocalDb(kv, LOCAL_USER_ID));
    const water = await again.from('water_logs').select('id, ml').eq('day', '2026-10-09');
    expect(water.data).toEqual([{ id: id(1), ml: 250 }]);
  });

  it('plans with nested days and exercises, soft delete and one active plan', async () => {
    const { c } = setup();
    const bench = (await c.from('exercises').select('id').eq('slug', 'bench-press').single())
      .data as { id: string };
    await c.from('workout_plans').insert({ id: id(10), name: 'Push', status: 'active' });
    await c.from('plan_days').insert({ id: id(11), plan_id: id(10), position: 0, name: 'Day 1' });
    await c
      .from('plan_exercises')
      .upsert([{ id: id(12), plan_day_id: id(11), exercise_id: bench.id, position: 0 }]);
    const plans = await c
      .from('workout_plans')
      .select('*, plan_days(*, plan_exercises(*, exercises(id, name)))')
      .is('deleted_at', null);
    const plan = (
      plans.data as {
        plan_days: { plan_exercises: { target_sets: number; exercises: { name: string } }[] }[];
      }[]
    )[0];
    expect(plan.plan_days[0].plan_exercises[0].target_sets).toBe(3);
    expect(plan.plan_days[0].plan_exercises[0].exercises.name).toBe('Barbell bench press');

    const second = await c
      .from('workout_plans')
      .insert({ id: id(13), name: 'Pull', status: 'active' });
    expect(second.error?.code).toBe('23505');

    await c
      .from('workout_plans')
      .update({ status: 'archived' })
      .eq('status', 'active')
      .is('deleted_at', null);
    const ok = await c.from('workout_plans').insert({ id: id(13), name: 'Pull', status: 'active' });
    expect(ok.error).toBeNull();

    await c.from('workout_plans').update({ deleted_at: new Date().toISOString() }).eq('id', id(13));
    const left = await c
      .from('workout_plans')
      .select('id')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    expect((left.data as unknown[]).length).toBe(1);
  });

  it('update with select().single() returns the row; single() on nothing is an error', async () => {
    const { c } = setup();
    const updated = await c
      .from('profiles')
      .update({ name: 'Sam' })
      .eq('id', LOCAL_USER_ID)
      .select()
      .single();
    expect(updated.data).toMatchObject({ name: 'Sam' });
    const missing = await c.from('profiles').select('*').eq('id', 'nope').single();
    expect(missing.error?.code).toBe('PGRST116');
    const maybe = await c.from('profiles').select('*').eq('id', 'nope').maybeSingle();
    expect(maybe).toEqual({ data: null, error: null });
  });

  it('keeps the safety limits of the database', async () => {
    const { c } = setup();
    const low = await c
      .from('nutrition_goals')
      .insert({ valid_from: '2026-10-09', kcal: 1400, protein_g: 100, carbs_g: 100, fat_g: 50 });
    expect(low.error?.code).toBe('23514');
    const deficit = await c.from('nutrition_goals').insert({
      valid_from: '2026-10-09',
      kcal: 1800,
      protein_g: 100,
      carbs_g: 100,
      fat_g: 50,
      maintenance_kcal: 3000,
    });
    expect(deficit.error?.code).toBe('23514');
    const fine = await c
      .from('nutrition_goals')
      .insert({ valid_from: '2026-10-09', kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 });
    expect(fine.error).toBeNull();
  });

  it('daily totals count food logs and ticked fixed meals only', async () => {
    const { c } = setup();
    await c.from('food_logs').insert({
      day: '2026-10-09',
      meal: 'lunch',
      name: 'Rice',
      grams: 100,
      kcal: 300,
      protein_g: 10,
    });
    await c.from('food_logs').insert({
      day: '2026-10-09',
      meal: 'lunch',
      name: 'Old',
      grams: 100,
      kcal: 999,
      deleted_at: new Date().toISOString(),
    });
    await c.from('fixed_meal_plans').insert({ id: id(20), name: 'Plan' });
    await c
      .from('fixed_meals')
      .insert({ id: id(21), plan_id: id(20), position: 0, name: 'Breakfast', kcal: 500 });
    await c
      .from('fixed_meal_checks')
      .insert({ day: '2026-10-09', fixed_meal_id: id(21), status: 'done', kcal: 500 });
    const clash = await c
      .from('fixed_meal_checks')
      .insert({ day: '2026-10-09', fixed_meal_id: id(21), status: 'done', kcal: 500 });
    expect(clash.error?.code).toBe('23505');
    const totals = await c
      .from('daily_nutrition_totals')
      .select('kcal, protein_g')
      .eq('day', '2026-10-09')
      .maybeSingle();
    expect(totals.data).toEqual({ kcal: 800, protein_g: 10 });
  });

  it('records, daily strength and last sets come from finished workouts', async () => {
    const { c } = setup();
    const bench = (await c.from('exercises').select('id').eq('slug', 'bench-press').single())
      .data as { id: string };
    await c.from('profiles').update({ timezone: 'UTC' }).eq('id', LOCAL_USER_ID);
    const finished = async (n: number, started: string, weight: number) => {
      await c.from('workout_sessions').upsert({ id: id(n), started_at: started, status: 'done' });
      await c.from('session_sets').upsert([
        {
          id: id(n + 100),
          session_id: id(n),
          exercise_id: bench.id,
          set_index: 0,
          weight_kg: weight,
          reps: 10,
          completed_at: started,
        },
        {
          id: id(n + 200),
          session_id: id(n),
          exercise_id: bench.id,
          set_index: 1,
          weight_kg: weight,
          reps: null,
          completed_at: null,
        },
      ]);
    };
    await finished(30, '2026-10-01T10:00:00.000Z', 60);
    await finished(31, '2026-10-08T10:00:00.000Z', 70);
    const records = await c.from('exercise_records').select('*').in('exercise_id', [bench.id]);
    expect(records.data).toEqual([
      expect.objectContaining({ exercise_id: bench.id, actual_max_kg: 70, completed_sets: 2 }),
    ]);
    const daily = await c
      .from('exercise_e1rm_daily')
      .select('day, sets, volume_kg')
      .eq('exercise_id', bench.id)
      .order('day', { ascending: true });
    expect(daily.data).toEqual([
      { day: '2026-10-01', sets: 1, volume_kg: 600 },
      { day: '2026-10-08', sets: 1, volume_kg: 700 },
    ]);
    const last = await c.rpc('last_sets', { p_exercise_ids: [bench.id] });
    expect(last.data).toEqual([
      expect.objectContaining({ exercise_id: bench.id, set_index: 0, weight_kg: 70, reps: 10 }),
    ]);
    // the exercise history query filters through the embedded session
    const history = await c
      .from('session_sets')
      .select('session_id, set_index, workout_sessions!inner(id, status)')
      .eq('exercise_id', bench.id)
      .not('completed_at', 'is', null)
      .eq('workout_sessions.status', 'done');
    expect((history.data as unknown[]).length).toBe(2);
  });

  it('drops (drop set) count in volume only, and last_sets says which rows are drops', async () => {
    const { c } = setup();
    const bench = (await c.from('exercises').select('id').eq('slug', 'bench-press').single())
      .data as { id: string };
    await c.from('profiles').update({ timezone: 'UTC' }).eq('id', LOCAL_USER_ID);
    const at = '2026-10-10T10:00:00.000Z';
    await c.from('workout_sessions').upsert({ id: id(40), started_at: at, status: 'done' });
    await c.from('session_sets').upsert([
      {
        id: id(41),
        session_id: id(40),
        exercise_id: bench.id,
        set_index: 0,
        drop_index: 0,
        weight_kg: 80,
        reps: 8,
        completed_at: at,
      },
      // A drop heavier than the set would only happen by mistake: it must still not be the max.
      {
        id: id(42),
        session_id: id(40),
        exercise_id: bench.id,
        set_index: 0,
        drop_index: 1,
        weight_kg: 100,
        reps: 10,
        completed_at: at,
      },
    ]);
    const records = await c.from('exercise_records').select('*').in('exercise_id', [bench.id]);
    expect(records.data).toEqual([
      expect.objectContaining({ actual_max_kg: 80, completed_sets: 1 }),
    ]);
    const daily = await c
      .from('exercise_e1rm_daily')
      .select('sets, volume_kg, best_weight_kg')
      .eq('exercise_id', bench.id);
    expect(daily.data).toEqual([{ sets: 1, volume_kg: 80 * 8 + 100 * 10, best_weight_kg: 80 }]);
    const last = await c.rpc('last_sets', { p_exercise_ids: [bench.id] });
    expect((last.data as { drop_index: number }[]).map((r) => r.drop_index)).toEqual([0, 1]);
  });

  it('files: photos go in and come out; delete-account wipes everything', async () => {
    const { c } = setup();
    await c.storage
      .from('progress-photos')
      .upload(`${LOCAL_USER_ID}/1.jpg`, new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' });
    const url = await c.storage
      .from('progress-photos')
      .createSignedUrl(`${LOCAL_USER_ID}/1.jpg`, 60);
    expect(url.data?.signedUrl).toContain(`progress-photos/${LOCAL_USER_ID}/1.jpg`);
    await c
      .from('progress_photos')
      .insert({ day: '2026-10-09', pose: 'front', storage_path: `${LOCAL_USER_ID}/1.jpg` });
    await c.from('water_logs').insert({ day: '2026-10-09', ml: 250 });
    await c.functions.invoke('delete-account');
    expect(((await c.from('water_logs').select('id')).data as unknown[]).length).toBe(0);
    expect(
      (await c.storage.from('progress-photos').createSignedUrl(`${LOCAL_USER_ID}/1.jpg`, 60)).data,
    ).toBeNull();
    expect(((await c.from('exercises').select('id')).data as unknown[]).length).toBeGreaterThan(60);
  });

  it('each account has its own data on the same device', async () => {
    const kv = memoryKv();
    const alice = createLocalClient(new LocalDb(kv, 'aaaaaaaa-0000-4000-8000-000000000001'));
    const bob = createLocalClient(new LocalDb(kv, 'bbbbbbbb-0000-4000-8000-000000000002'));
    await alice.from('water_logs').insert({ day: '2026-10-09', ml: 250 });
    expect(((await alice.from('water_logs').select('id')).data as unknown[]).length).toBe(1);
    expect(((await bob.from('water_logs').select('id')).data as unknown[]).length).toBe(0);
    const row = await alice.from('water_logs').select('user_id').single();
    expect(row.data).toEqual({ user_id: 'aaaaaaaa-0000-4000-8000-000000000001' });
    const profile = await bob.from('profiles').select('id').single();
    expect(profile.data).toEqual({ id: 'bbbbbbbb-0000-4000-8000-000000000002' });
    // deleting Alice's account leaves Bob's data alone
    await bob.from('water_logs').insert({ day: '2026-10-09', ml: 500 });
    await alice.functions.invoke('delete-account');
    expect(((await bob.from('water_logs').select('id')).data as unknown[]).length).toBe(1);
  });

  it('a custom food can be edited, have its portions replaced, be deleted and restored', async () => {
    const { c } = setup();
    const food = { id: id(40), owner_id: LOCAL_USER_ID, source: 'custom', kcal_100g: 100 };
    await c.from('foods').upsert({ ...food, name: 'Bar' });
    await c
      .from('food_servings')
      .insert({ id: id(41), food_id: id(40), label: '1 bar', grams: 40 });
    // edit: same id, new values, old portions soft-deleted
    expect(
      (await c.from('foods').upsert({ ...food, name: 'Big bar', kcal_100g: 120 })).error,
    ).toBeNull();
    await c
      .from('food_servings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('food_id', id(40))
      .is('deleted_at', null);
    const edited = await c.from('foods').select('name, kcal_100g').eq('id', id(40)).single();
    expect(edited.data).toEqual({ name: 'Big bar', kcal_100g: 120 });
    const live = await c
      .from('food_servings')
      .select('id')
      .eq('food_id', id(40))
      .is('deleted_at', null);
    expect((live.data as unknown[]).length).toBe(0);
    // delete and undo
    await c.from('foods').update({ deleted_at: new Date().toISOString() }).eq('id', id(40));
    const mine = () =>
      c.from('foods').select('id').eq('owner_id', LOCAL_USER_ID).is('deleted_at', null);
    expect(((await mine()).data as unknown[]).length).toBe(0);
    await c.from('foods').update({ deleted_at: null }).eq('id', id(40));
    expect(((await mine()).data as unknown[]).length).toBe(1);
  });

  it('online-only helpers say so instead of failing silently', async () => {
    const { c } = setup();
    const res = await c.functions.invoke('off');
    expect(res.error?.message).toMatch(/offline/i);
  });

  it('moving the account-less data to a new account: same rows, new owner, old database empty', async () => {
    const { kv, db, c } = setup();
    const NEW = 'bbbbbbbb-0000-4000-8000-000000000009';
    await c.from('water_logs').insert({ id: id(70), day: '2026-10-14', ml: 500 });
    await c.from('body_metrics').insert({ id: id(71), day: '2026-10-14', weight_kg: 81 });
    await c.from('profiles').update({ name: 'Test' }).eq('id', LOCAL_USER_ID);
    await db.save();

    const moved = await moveLocalData(LOCAL_USER_ID, NEW, kv);
    expect(moved).toBeGreaterThan(2);

    const next = createLocalClient(new LocalDb(kv, NEW));
    const water = await next.from('water_logs').select('id, user_id, ml');
    expect(water.data).toEqual([{ id: id(70), user_id: NEW, ml: 500 }]);
    const profile = await next.from('profiles').select('id, name').single();
    expect(profile.data).toEqual({ id: NEW, name: 'Test' });
    const catalogueLeft = await next.from('exercises').select('id').is('owner_id', null);
    expect((catalogueLeft.data as unknown[]).length).toBeGreaterThan(10);

    const old = createLocalClient(new LocalDb(kv, LOCAL_USER_ID));
    expect((await old.from('water_logs').select('id')).data).toEqual([]);
    expect((await old.from('profiles').select('name').single()).data).toEqual({ name: null });
  });
});

describe('copying an account to the account-less database (account deleted, data kept)', () => {
  const ACC = 'cccccccc-0000-4000-8000-000000000003';
  const account = () => {
    const kv = memoryKv();
    const db = new LocalDb(kv, ACC);
    return { kv, db, c: createLocalClient(db) };
  };

  it('keeps every row and id, gives them to the account-less user and copies the photos', async () => {
    const { kv, db, c } = account();
    db.tracking = true; // a synced account: its outbox must not come along
    await c.from('profiles').update({ name: 'Ada' }).eq('id', ACC);
    await c.from('user_settings').update({ weight_unit: 'lb' }).eq('user_id', ACC);
    await c.from('water_logs').insert({ id: id(80), day: '2026-10-16', ml: 300 });
    await c.from('consents').insert({ id: id(81), type: 'health_data', policy_version: '2026-10' });
    await c.from('exercises').insert({
      id: id(82),
      owner_id: ACC,
      name: 'Band pull',
      primary_muscle: 'back',
      image_path: `${ACC}/band.jpg`,
    });
    await c.storage.from('user-exercise-images').upload(`${ACC}/band.jpg`, new Uint8Array([7]));
    await c.storage.from('progress-photos').upload(`${ACC}/front.jpg`, new Uint8Array([1, 2]));
    await c
      .from('progress_photos')
      .insert({ id: id(83), day: '2026-10-16', pose: 'front', storage_path: `${ACC}/front.jpg` });
    await c
      .from('progress_photos')
      .insert({ id: id(84), day: '2026-10-15', pose: 'side', storage_path: `${ACC}/gone.jpg` });
    expect(Object.keys(db.outbox).length).toBeGreaterThan(0);
    await db.flush();

    const res = await copyLocalData(ACC, LOCAL_USER_ID, kv);
    expect(res).toMatchObject({ ok: true, files: 2, missingFiles: 1 });

    const local = new LocalDb(kv, LOCAL_USER_ID);
    const l = createLocalClient(local);
    expect((await l.from('profiles').select('id, name').single()).data).toEqual({
      id: LOCAL_USER_ID,
      name: 'Ada',
    });
    expect((await l.from('user_settings').select('user_id, weight_unit').single()).data).toEqual({
      user_id: LOCAL_USER_ID,
      weight_unit: 'lb',
    });
    expect((await l.from('water_logs').select('id, user_id')).data).toEqual([
      { id: id(80), user_id: LOCAL_USER_ID },
    ]);
    expect((await l.from('consents').select('id, user_id, type')).data).toEqual([
      { id: id(81), user_id: LOCAL_USER_ID, type: 'health_data' },
    ]);
    const photo = await l.from('progress_photos').select('storage_path').eq('id', id(83)).single();
    expect(photo.data).toEqual({ storage_path: `${LOCAL_USER_ID}/front.jpg` });
    expect(await kv.readFile(`progress-photos/${LOCAL_USER_ID}/front.jpg`)).toEqual(
      new Uint8Array([1, 2]),
    );
    const own = await l.from('exercises').select('owner_id, image_path').eq('id', id(82)).single();
    expect(own.data).toEqual({ owner_id: LOCAL_USER_ID, image_path: `${LOCAL_USER_ID}/band.jpg` });
    expect(await kv.readFile(`user-exercise-images/${LOCAL_USER_ID}/band.jpg`)).toEqual(
      new Uint8Array([7]),
    );
    expect(local.outbox).toEqual({});

    // the source is untouched; erasing it afterwards leaves the copies alone
    expect(db.tables.water_logs).toHaveLength(1);
    await db.wipe();
    expect(await kv.readFile(`progress-photos/${ACC}/front.jpg`)).toBeNull();
    expect(await kv.readFile(`progress-photos/${LOCAL_USER_ID}/front.jpg`)).not.toBeNull();
  });

  it('refuses, writing nothing, when the account-less database already has data', async () => {
    const { kv, db, c } = account();
    await c.from('water_logs').insert({ id: id(90), day: '2026-10-16', ml: 300 });
    await db.flush();
    const earlier = new LocalDb(kv, LOCAL_USER_ID);
    await createLocalClient(earlier)
      .from('body_metrics')
      .insert({ id: id(91), day: '2026-10-01', weight_kg: 70 });
    await earlier.flush();
    const saved = kv.texts.get(`database-${LOCAL_USER_ID}.json`);
    expect(await copyLocalData(ACC, LOCAL_USER_ID, kv)).toEqual({ ok: false, reason: 'not-empty' });
    expect(kv.texts.get(`database-${LOCAL_USER_ID}.json`)).toBe(saved);
  });

  it('an account-less database that was only opened (or emptied by Create an account) counts as empty', async () => {
    const { kv } = account();
    const empty = new LocalDb(kv, LOCAL_USER_ID);
    await empty.ready;
    expect(hasOwnData(empty)).toBe(false);
    await empty.wipeTables();
    expect(hasOwnData(empty)).toBe(false);
    expect((await copyLocalData(ACC, LOCAL_USER_ID, kv)).ok).toBe(true);
  });
});

describe('generic foods (CIQUAL)', () => {
  it('are readable like any food, never stored in the user database', async () => {
    const { db, c } = setup();
    const res = await c
      .from('foods')
      .select('id, name, source, kcal_100g')
      .ilike('name', '%apple, pulp and peel, raw%');
    const apple = (res.data as { id: string; source: string; kcal_100g: number }[])[0];
    expect(apple).toMatchObject({
      id: 'cf000000-0000-4000-8000-000000013039',
      source: 'ciqual',
      kcal_100g: 52,
    });
    await db.ready;
    expect(db.tables.foods.some((f) => f.source === 'ciqual')).toBe(false);
  });
});

describe('the database file survives crashes and restarts', () => {
  const key = `database-${LOCAL_USER_ID}.json`;

  it('a file cut short (restart in the middle of a save): the previous copy is used, the bad one kept', async () => {
    const first = setup();
    await first.db.ready;
    await first.c.from('profiles').update({ name: 'Ada' }).eq('id', LOCAL_USER_ID);
    await first.db.save();
    const good = first.kv.texts.get(key)!;
    first.kv.texts.set(`${key}.bak`, good);
    first.kv.texts.set(key, good.slice(0, good.length / 2)); // cut short

    const again = new LocalDb(first.kv, LOCAL_USER_ID);
    await again.ready;
    expect(again.tables.profiles[0].name).toBe('Ada');
    expect(again.freshStart).toBe(false);
    expect([...first.kv.texts.keys()].some((k) => k.startsWith(`${key}.unreadable-`))).toBe(true);
  });

  it('opening the database does not write it when nothing changed', async () => {
    const first = setup();
    await first.db.ready;
    await first.db.save();
    const writes: string[] = [];
    const kv = { ...first.kv, setText: async (k: string, v: string) => void writes.push(k, v) };
    const again = new LocalDb(kv, LOCAL_USER_ID);
    await again.ready;
    expect(writes).toEqual([]);
    expect(again.freshStart).toBe(false);
  });

  it('a device with no database: the empty profile it makes yields to the real one from the server', async () => {
    const { db } = setup();
    await db.ready;
    expect(db.freshStart).toBe(true);
    db.applyRemote('profiles', [
      {
        id: LOCAL_USER_ID,
        name: 'Ada',
        onboarding_completed_at: '2026-10-01T10:00:00.000Z',
        updated_at: '2026-10-01T10:00:00.000Z',
      },
    ]);
    expect(db.tables.profiles[0]).toMatchObject({ name: 'Ada' });
    expect(db.tables.profiles[0].onboarding_completed_at).not.toBeNull();
  });

  it('flush waits for a pending save', async () => {
    const { db, c, kv } = setup();
    await db.ready;
    await c.from('water_logs').insert({ id: id(900), day: '2026-10-14', ml: 250 });
    await db.flush();
    expect(kv.texts.get(key)).toContain(id(900));
  });

  it('noting changes for the sync is remembered: a widget writing with the app closed fills the outbox', async () => {
    const { db, c, kv } = setup();
    await db.ready;
    db.tracking = true;
    await c.from('water_logs').insert({ id: id(901), day: '2026-10-14', ml: 250 });
    await db.flush();
    // Another start (a widget task with the app closed): nobody has turned the sync on yet.
    const again = new LocalDb(kv, LOCAL_USER_ID);
    await again.ready;
    expect(again.tracking).toBe(true);
    await createLocalClient(again)
      .from('water_logs')
      .insert({ id: id(902), day: '2026-10-14', ml: 250 });
    expect(Object.keys(again.outbox)).toContain(`water_logs:${id(902)}`);
    // Never noted: stays off.
    const fresh = setup();
    await fresh.db.ready;
    await fresh.db.flush();
    const reopened = new LocalDb(fresh.kv, LOCAL_USER_ID);
    await reopened.ready;
    expect(reopened.tracking).toBe(false);
  });
});

describe('deleted rows leave the device for good after a week (DECISIONS 79)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  const ACC = 'aaaaaaaa-0000-4000-8000-0000000000aa';

  it('rows deleted more than 7 days ago go with their photo file; newer and live ones stay', async () => {
    const kv = memoryKv();
    const db = new LocalDb(kv, ACC);
    await db.ready;
    db.tracking = true;
    const photo = (n: number, file: string, deletedAt: string | null) => ({
      id: id(n),
      user_id: ACC,
      day: '2026-10-01',
      pose: 'front',
      storage_path: `${ACC}/${file}`,
      deleted_at: deletedAt,
    });
    db.tables.progress_photos.push(
      photo(1, 'old.jpg', ago(8)),
      photo(2, 'new.jpg', ago(1)),
      photo(3, 'live.jpg', null),
    );
    await kv.putFile(`progress-photos/${ACC}/old.jpg`, new Uint8Array([1]), 'image/jpeg');
    await kv.putFile(`progress-photos/${ACC}/new.jpg`, new Uint8Array([2]), 'image/jpeg');
    expect(await db.purgeDeleted()).toBe(1);
    expect(db.tables.progress_photos.map((p) => p.id)).toEqual([id(2), id(3)]);
    expect(await kv.readFile(`progress-photos/${ACC}/old.jpg`)).toBeNull();
    expect(await kv.readFile(`progress-photos/${ACC}/new.jpg`)).not.toBeNull();
    // The server and the other devices delete it too: a deletion with its file in the outbox.
    expect(db.outbox[`progress_photos:${id(1)}`]).toMatchObject({
      op: 'delete',
      file: { bucket: 'progress-photos', path: `${ACC}/old.jpg` },
    });
  });

  it('an own exercise used in a past workout stays; a deleted workout takes its sets', async () => {
    const db = new LocalDb(memoryKv(), ACC);
    await db.ready;
    db.tables.exercises.push(
      { id: id(10), owner_id: ACC, name: 'Used', deleted_at: ago(30) },
      { id: id(11), owner_id: ACC, name: 'Unused', deleted_at: ago(30) },
    );
    db.tables.workout_sessions.push(
      { id: id(20), user_id: ACC, status: 'done', deleted_at: null },
      { id: id(21), user_id: ACC, status: 'done', deleted_at: ago(9) },
    );
    db.tables.session_sets.push(
      { id: id(30), user_id: ACC, session_id: id(20), exercise_id: id(10), deleted_at: null },
      { id: id(31), user_id: ACC, session_id: id(21), exercise_id: id(11), deleted_at: null },
    );
    await db.purgeDeleted();
    const own = db.tables.exercises.filter((e) => e.owner_id === ACC).map((e) => e.id);
    expect(own).toEqual([id(10)]);
    expect(db.tables.workout_sessions.map((s) => s.id)).toEqual([id(20)]);
    expect(db.tables.session_sets.map((s) => s.id)).toEqual([id(30)]);
    // Not tracking (no copy on the server): nothing noted for a sync.
    expect(Object.keys(db.outbox)).toHaveLength(0);
  });

  it('catalogue rows are never purged; the purge runs when the database opens', async () => {
    const kv = memoryKv();
    const first = new LocalDb(kv, ACC);
    await first.ready;
    const catalogue = first.tables.exercises.find((e) => e.owner_id == null)!;
    catalogue.deleted_at = ago(100);
    first.tables.water_logs.push({
      id: id(40),
      user_id: ACC,
      day: '2026-09-01',
      ml: 250,
      deleted_at: ago(10),
    });
    await first.save();
    const again = new LocalDb(kv, ACC);
    await again.ready;
    expect(again.tables.water_logs).toHaveLength(0);
    expect(again.tables.exercises.some((e) => e.id === catalogue.id)).toBe(true);
  });

  it('a device back after months drops what the server lost, except its unsent changes', async () => {
    const db = new LocalDb(memoryKv(), ACC);
    await db.ready;
    db.tables.water_logs.push(
      { id: id(50), user_id: ACC, day: '2026-01-01', ml: 250 },
      { id: id(51), user_id: ACC, day: '2026-01-02', ml: 250 },
      { id: id(52), user_id: ACC, day: '2026-01-03', ml: 250 },
    );
    db.outbox[`water_logs:${id(52)}`] = {
      table: 'water_logs',
      key: id(52),
      op: 'upsert',
      at: ago(0),
    };
    expect(db.dropMissing('water_logs', new Set([id(50)]), (r) => r.user_id === ACC)).toBe(true);
    expect(db.tables.water_logs.map((w) => w.id)).toEqual([id(50), id(52)]);
  });
});

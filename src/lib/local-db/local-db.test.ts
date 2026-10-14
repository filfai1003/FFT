import { createLocalClient } from './client';
import { LocalDb, type Kv } from './engine';
import { LOCAL_USER_ID } from './schema';
import { moveLocalData } from './index';

function memoryKv(): Kv & { texts: Map<string, string> } {
  const texts = new Map<string, string>();
  const files = new Map<string, Uint8Array>();
  return {
    texts,
    getText: async (k) => texts.get(k) ?? null,
    setText: async (k, v) => void texts.set(k, v),
    putFile: async (k, b) => void files.set(k, b),
    fileUrl: async (k) => (files.has(k) ? `blob:${k}` : null),
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

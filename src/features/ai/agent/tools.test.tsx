import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useSessionStore } from '@/features/auth/session-store';
import { createLocalClient } from '@/lib/local-db/client';
import { LocalDb, type Kv } from '@/lib/local-db/engine';
import { LOCAL_USER_ID } from '@/lib/local-db/schema';
import { runTool, undoCall } from './run';
import { useAgentTools } from './use-tools';
import { FULL_ACCESS, NO_ACCESS, type AiAccess } from '../access';

function memoryKv(): Kv {
  const texts = new Map<string, string>();
  return {
    getText: async (k) => texts.get(k) ?? null,
    setText: async (k, v) => void texts.set(k, v),
    putFile: async () => undefined,
    fileUrl: async () => null,
    readFile: async () => null,
    removeFile: async () => undefined,
    clearAll: async () => texts.clear(),
  };
}

const mockClient = createLocalClient(new LocalDb(memoryKv(), LOCAL_USER_ID));
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockClient }));

async function setup(access: AiAccess = FULL_ACCESS) {
  useSessionStore.setState({ userId: LOCAL_USER_ID });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(() => useAgentTools(access), { wrapper });
  await waitFor(() => expect(hook.result.current.length).toBeGreaterThan(10));
  // every tool call goes through the approval step, as in the app
  const asked: string[] = [];
  const call = (name: string, input: Record<string, unknown>) =>
    runTool({ id: `${name}-${Math.random()}`, name, input }, hook.result.current, async (c) => {
      asked.push(c.name);
      return 'approved';
    });
  return { call, tools: hook.result.current, asked };
}

describe('the assistant changing data (after approval)', () => {
  it('every changing tool is marked as a write, every reading one is not', async () => {
    const { tools } = await setup();
    const writes = tools
      .filter((t) => t.write)
      .map((t) => t.name)
      .sort();
    expect(writes).toEqual([
      'add_supplement',
      'create_food',
      'delete_food',
      'log_body',
      'log_food',
      'log_water',
      'propose_plans',
      'remove_food_log',
      'set_meal_status',
      'set_nutrition_goal',
      'set_supplement',
      'update_food',
    ]);
    expect(
      tools
        .filter((t) => !t.write)
        .every(
          (t) =>
            t.name.startsWith('get_') ||
            t.name.endsWith('_foods') ||
            ['list_exercises', 'list_data', 'query_data'].includes(t.name),
        ),
    ).toBe(true);
  });

  it('logs body values, rejects nonsense, and reads them back', async () => {
    const { call } = await setup();
    expect(
      (await call('log_body', { weight_kg: 82.4, body_fat_pct: 17, day: '2026-10-10' })).outcome,
    ).toBe('done');
    const bad = await call('log_body', { weight_kg: 5 });
    expect(bad.outcome).toBe('error');
    expect(bad.content).toContain('between');
    expect((await call('log_body', {})).outcome).toBe('error');
    const body = JSON.parse((await call('get_body', { days: 400 })).content);
    expect(body.entries[0]).toMatchObject({ day: '2026-10-10', weight_kg: 82.4, body_fat_pct: 17 });
  });

  it('undo takes a body entry back (a new one disappears, an edited one gets its old values)', async () => {
    const { call } = await setup();
    const first = await call('log_body', { weight_kg: 80, day: '2026-09-01' });
    await undoCall(first.callId);
    const days = async () =>
      JSON.parse((await call('get_body', { days: 730 })).content).entries as {
        day: string;
        weight_kg: number;
      }[];
    expect((await days()).find((e) => e.day === '2026-09-01')).toBeUndefined();

    await call('log_body', { weight_kg: 80, day: '2026-09-02' });
    const edit = await call('log_body', { weight_kg: 79, day: '2026-09-02' });
    await undoCall(edit.callId);
    expect((await days()).find((e) => e.day === '2026-09-02')?.weight_kg).toBe(80);
  });

  it('creates a food, logs it by grams, shows it in the day, edits and deletes it', async () => {
    const { call } = await setup();
    const created = await call('create_food', {
      name: 'Oat bar',
      kcal_100g: 400,
      protein_100g: 10,
      carbs_100g: 60,
      fat_100g: 12,
      portions: [{ label: '1 bar', grams: 40 }],
    });
    const foodId = JSON.parse(created.content).food_id as string;
    expect(foodId).toBeTruthy();
    const logged = await call('log_food', {
      food_id: foodId,
      grams: 50,
      meal: 'snack',
      day: '2026-10-12',
    });
    expect(JSON.parse(logged.content)).toMatchObject({ kcal: 200, protein: 5 });
    const day = JSON.parse((await call('get_day', { day: '2026-10-12' })).content);
    expect(day.food_log).toMatchObject([{ name: 'Oat bar', meal: 'snack', kcal: 200 }]);

    expect((await call('update_food', { food_id: foodId, kcal_100g: 420 })).outcome).toBe('done');
    const found = JSON.parse((await call('search_foods', { query: 'oat' })).content);
    expect(found.foods[0]).toMatchObject({ mine: true, per_100g: { kcal: 420, protein_g: 10 } });

    expect((await call('delete_food', { food_id: foodId })).outcome).toBe('done');
    // Gone from the search (generic foods like "Oat, raw" are still there).
    const left = JSON.parse((await call('search_foods', { query: 'oat' })).content).foods as {
      food_id: string;
      mine: boolean;
    }[];
    expect(left.some((f) => f.food_id === foodId || f.mine)).toBe(false);
    // the entry already logged keeps its values
    const after = JSON.parse((await call('get_day', { day: '2026-10-12' })).content);
    expect(after.food_log).toHaveLength(1);
  });

  it('a quick food entry, removing an entry and water', async () => {
    const { call } = await setup();
    const quick = await call('log_food', {
      meal: 'lunch',
      name: 'Restaurant pasta',
      kcal: 800,
      protein_g: 30,
      carbs_g: 100,
      fat_g: 30,
      day: '2026-10-11',
    });
    const logId = JSON.parse(quick.content).log_id as string;
    expect((await call('log_water', { ml: 400, day: '2026-10-11' })).outcome).toBe('done');
    let day = JSON.parse((await call('get_day', { day: '2026-10-11' })).content);
    expect(day.eaten.kcal).toBe(800);
    expect(day.water_ml).toBe(400);
    expect((await call('remove_food_log', { log_id: logId })).outcome).toBe('done');
    day = JSON.parse((await call('get_day', { day: '2026-10-11' })).content);
    expect(day.food_log).toHaveLength(0);
  });

  it('the calorie target keeps the safety rules and the macros must add up', async () => {
    const { call } = await setup();
    const low = await call('set_nutrition_goal', {
      kcal: 1200,
      protein_g: 100,
      carbs_g: 100,
      fat_g: 50,
    });
    expect(low.outcome).toBe('error');
    expect(low.content).toContain('1500');
    const off = await call('set_nutrition_goal', {
      kcal: 2400,
      protein_g: 100,
      carbs_g: 100,
      fat_g: 50,
    });
    expect(off.outcome).toBe('error');
    expect(off.content).toContain('add up');
    const ok = await call('set_nutrition_goal', {
      kcal: 2400,
      protein_g: 180,
      carbs_g: 250,
      fat_g: 77,
    });
    expect(ok.outcome).toBe('done');
    const diet = JSON.parse((await call('get_diet', {})).content);
    expect(diet.diet_plan.daily.kcal).toBe(2400);
  });
});

describe('what the coach may see (DECISIONS 66)', () => {
  const parsed = async (r: Promise<{ content: string }>) => JSON.parse((await r).content);

  it('nothing shared: every data tool says so, and changes are not even proposed', async () => {
    const { call, asked } = await setup(NO_ACCESS);
    for (const [name, category] of [
      ['get_body', 'profile'],
      ['get_diet', 'diet'],
      ['get_workouts', 'training'],
      ['get_workout_plans', 'training'],
      ['get_strength', 'training'],
      ['get_day', 'diet'],
      ['get_history', 'diet'],
      ['search_foods', 'diet'],
    ] as const)
      expect(await parsed(call(name, {}))).toMatchObject({ not_shared: category });
    expect(await parsed(call('query_data', { table: 'progress_photos' }))).toMatchObject({
      not_shared: 'photos',
    });
    expect(await parsed(call('query_data', { table: 'profiles' }))).toMatchObject({
      not_shared: 'profile',
    });
    const map = await parsed(call('list_data', {}));
    expect(map.tables).toEqual([]);
    expect(map.not_shared).toEqual(['profile', 'diet', 'training', 'photos']);

    expect(await parsed(call('log_body', { weight_kg: 80 }))).toMatchObject({
      not_shared: 'profile',
    });
    expect(await parsed(call('log_water', { ml: 200 }))).toMatchObject({ not_shared: 'diet' });
    expect(
      await parsed(call('propose_plans', { workout_plan: { name: 'x', days: [] } })),
    ).toMatchObject({ not_shared: 'training' });
    expect(asked).toEqual([]);

    const overview = await parsed(call('get_overview', {}));
    expect(overview.profile).toBe('not shared by the user');
    expect(overview).not.toHaveProperty('latest_weight');
    expect(overview).not.toHaveProperty('today_status');
    expect(overview).not.toHaveProperty('workout_plans');
  });

  it('diet shared only: the day shows food but no workouts, the body stays hidden', async () => {
    const { call } = await setup({ ...NO_ACCESS, diet: true });
    await call('log_water', { ml: 300, day: '2026-10-05' });
    const day = await parsed(call('get_day', { day: '2026-10-05' }));
    expect(day.water_ml).toBe(300);
    expect(day).not.toHaveProperty('workouts');
    const history = await parsed(call('get_history', { days: 3 }));
    expect(history).not.toHaveProperty('workouts');
    expect(history.days[0]).not.toHaveProperty('trained');
    expect(await parsed(call('get_body', {}))).toMatchObject({ not_shared: 'profile' });
    const tables = (await parsed(call('list_data', {}))).tables.map(
      (t: { table: string }) => t.table,
    );
    expect(tables).toContain('food_logs');
    expect(tables).not.toContain('body_metrics');
    expect(tables).not.toContain('session_sets');
  });
});

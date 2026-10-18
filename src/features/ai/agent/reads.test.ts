import { createLocalClient } from '@/lib/local-db/client';
import { LocalDb, type Kv } from '@/lib/local-db/engine';
import { LOCAL_USER_ID } from '@/lib/local-db/schema';
import { readBody, readDay, readDiet, readFoods, readHistory, readWorkouts } from './reads';

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

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ctx = { today: '2026-10-13', timeZone: 'UTC', dietMode: 'tracking' };

beforeAll(async () => {
  const c = mockClient;
  await c.from('nutrition_goals').insert({
    id: id(1),
    valid_from: '2026-10-01',
    kcal: 2400,
    protein_g: 180,
    carbs_g: 250,
    fat_g: 70,
    training_day_bonus_kcal: 200,
    water_ml: 2500,
    maintenance_kcal: 2700,
  });
  await c.from('food_logs').insert([
    {
      id: id(2),
      day: '2026-10-13',
      meal: 'lunch',
      name: 'Rice',
      grams: 200,
      kcal: 260,
      protein_g: 5,
      carbs_g: 56,
      fat_g: 1,
    },
    {
      id: id(3),
      day: '2026-10-12',
      meal: 'lunch',
      name: 'Pasta',
      grams: 300,
      kcal: 2400,
      protein_g: 90,
      carbs_g: 300,
      fat_g: 60,
    },
  ]);
  await c.from('water_logs').insert({ id: id(4), day: '2026-10-13', ml: 500 });
  await c
    .from('body_metrics')
    .insert({ id: id(5), day: '2026-10-10', weight_kg: 82.4, body_fat_pct: 17 });
  await c.from('workout_sessions').insert({
    id: id(6),
    day_name: 'Push A',
    status: 'done',
    started_at: '2026-10-12T17:00:00Z',
    ended_at: '2026-10-12T18:00:00Z',
  });
  await c.from('foods').insert({
    id: id(7),
    name: 'Protein bar',
    source: 'custom',
    kcal_100g: 380,
    protein_100g: 30,
    carbs_100g: 35,
    fat_100g: 12,
  });
});

describe('what the AI can look at', () => {
  it('a day: target, what was eaten, whether it was on target, water', async () => {
    const d = await readDay(ctx, '2026-10-13');
    expect(d.target).toMatchObject({ kcal: 2400 });
    expect(d.eaten.kcal).toBe(260);
    expect(d.diet_status).toBe('off');
    expect(d.food_log).toMatchObject([{ name: 'Rice', meal: 'lunch', kcal: 260 }]);
    expect(d.water_ml).toBe(500);
    const yesterday = await readDay(ctx, '2026-10-12');
    expect(yesterday.diet_status).toBe('onTarget');
    expect(yesterday.workouts).toEqual([{ name: 'Push A', minutes: 60 }]);
    expect(yesterday.target).toMatchObject({ kcal: 2600 }); // training day bonus
  });

  it('history: per-day status and a summary', async () => {
    const h = await readHistory(ctx, 7);
    expect(h.days).toHaveLength(7);
    expect(h.summary).toMatchObject({ days_with_food_logged: 2, workouts: 1, days_trained: 1 });
    expect(h.days.find((x) => x.day === '2026-10-12')).toMatchObject({
      trained: true,
      eaten_kcal: 2400,
    });
  });

  it('body, workouts, foods and diet', async () => {
    expect((await readBody(ctx, 30)).entries[0]).toMatchObject({
      weight_kg: 82.4,
      body_fat_pct: 17,
    });
    expect((await readWorkouts(5)).workouts).toHaveLength(1);
    const foods = await readFoods('bar', LOCAL_USER_ID);
    expect(foods.foods[0]).toMatchObject({ name: 'Protein bar', per_100g: { kcal: 380 } });
    expect((await readDiet(ctx)).maintenance_kcal).toBe(2700);
  });
});

describe('without a target (DECISIONS 104)', () => {
  beforeAll(async () => {
    await mockClient.from('nutrition_goals').insert({
      id: id(8),
      valid_from: '2026-10-13',
      kcal: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      water_ml: 2500,
    });
  });

  it('says no target is set, and days before keep their target', async () => {
    const d = await readDay(ctx, '2026-10-13');
    expect(d.target).toBe('no target set');
    expect(d.diet_status).toBe('none');
    expect((await readDay(ctx, '2026-10-12')).target).toMatchObject({ kcal: 2600 });
    const h = await readHistory(ctx, 7);
    expect(h.days.find((x) => x.day === '2026-10-13')).toMatchObject({
      target_kcal: null,
      diet: 'no_target',
    });
    expect(h.summary.days_with_food_logged).toBe(2);
    const diet = await readDiet(ctx);
    expect(diet.calorie_target).toBe('no target set');
    expect(diet.diet_plan?.daily).toBeNull();
  });
});

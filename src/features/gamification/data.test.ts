import { computeGamification } from '@/domain/gamification';
import { createLocalClient } from '@/lib/local-db/client';
import { LocalDb, type Kv } from '@/lib/local-db/engine';
import { LOCAL_USER_ID } from '@/lib/local-db/schema';
import { fetchActivity } from './data';
import { badgeToCelebrate } from './seen-badges';

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

let mockClient: ReturnType<typeof createLocalClient>;
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockClient }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BENCH = id(900);

async function seed() {
  mockClient = createLocalClient(new LocalDb(memoryKv(), LOCAL_USER_ID));
  await mockClient.from('profiles').insert({ id: LOCAL_USER_ID, timezone: 'UTC' });
  await mockClient.from('nutrition_goals').insert({
    id: id(1),
    valid_from: '2026-10-01',
    kcal: 2000,
    protein_g: 150,
    carbs_g: 200,
    fat_g: 60,
    training_day_bonus_kcal: 0,
    water_ml: 2500,
  });
  // Two finished workouts with sets, one finished with nothing done, one still running.
  const sessions = [
    { n: 10, at: '2026-10-12T06:30:00Z', status: 'done', weight: 80 },
    { n: 11, at: '2026-10-13T18:00:00Z', status: 'done', weight: 85 },
    { n: 12, at: '2026-10-14T18:00:00Z', status: 'done', weight: null },
    { n: 13, at: '2026-10-15T18:00:00Z', status: 'in_progress', weight: 120 },
  ];
  for (const s of sessions) {
    await mockClient.from('workout_sessions').insert({
      id: id(s.n),
      plan_id: null,
      day_name: 'Push',
      started_at: s.at,
      status: s.status,
    });
    if (s.weight != null)
      await mockClient.from('session_sets').insert({
        id: id(s.n + 100),
        session_id: id(s.n),
        exercise_id: BENCH,
        set_index: 0,
        drop_index: 0,
        weight_kg: s.weight,
        reps: 5,
        completed_at: s.at,
      });
  }
  // Food: on target on the 12th (1900 of 2000), off on the 13th (1200).
  await mockClient.from('food_logs').insert([
    { id: id(20), day: '2026-10-12', meal: 'lunch', name: 'Rice', kcal: 1900 },
    { id: id(21), day: '2026-10-13', meal: 'lunch', name: 'Rice', kcal: 1200 },
  ]);
  await mockClient.from('body_metrics').insert({ id: id(30), day: '2026-10-14', weight_kg: 80 });
}

describe('gamification data (read from the device)', () => {
  beforeEach(seed);

  it('workouts need a completed set; diet on target, check-ins and logged days', async () => {
    const a = await fetchActivity('UTC');
    expect(a.workouts.map((w) => [w.day, w.hour])).toEqual(
      expect.arrayContaining([
        ['2026-10-12', 6],
        ['2026-10-13', 18],
      ]),
    );
    expect(a.workouts).toHaveLength(2);
    expect([...a.dietOnTargetDays]).toEqual(['2026-10-12']);
    expect([...a.checkInDays]).toEqual(['2026-10-14']);
    expect([...a.loggedDays].sort()).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(a.exerciseDays.map((r) => r.bestWeightKg)).toEqual([80, 85]);
  });

  it('gives a streak, a record and the first badges', async () => {
    const a = await fetchActivity('UTC');
    const g = computeGamification({ ...a, today: '2026-10-15' });
    expect(g.streak).toBe(3);
    expect(g.records).toEqual([
      expect.objectContaining({ kind: 'max', valueKg: 85, deltaKg: 5, day: '2026-10-13' }),
      expect.objectContaining({ kind: 'est1rm', day: '2026-10-13' }),
    ]);
    const earned = g.badges.filter((b) => b.earned).map((b) => b.id);
    expect(earned).toEqual(['first_workout', 'first_record']);
  });
});

describe('badge sheet: which badge to celebrate', () => {
  const earned = [
    { id: 'first_workout', earnedOn: '2026-10-01' },
    { id: 'workouts_10', earnedOn: '2026-10-14' },
    { id: 'streak_7', earnedOn: '2026-10-14' },
  ];
  it('nothing on the first run on a device', () => {
    expect(badgeToCelebrate(earned, null)).toBeNull();
  });
  it('the newest unseen one, and how many others came with it', () => {
    expect(badgeToCelebrate(earned, new Set(['first_workout']))).toEqual({
      id: 'workouts_10',
      others: 1,
    });
    expect(badgeToCelebrate(earned, new Set(earned.map((b) => b.id)))).toBeNull();
  });
});

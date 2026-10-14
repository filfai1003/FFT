import { createLocalClient } from '@/lib/local-db/client';
import { LocalDb, type Kv } from '@/lib/local-db/engine';
import { LOCAL_USER_ID } from '@/lib/local-db/schema';
import { listData, queryData, strengthReport } from './explore';

function memoryKv(): Kv {
  const texts = new Map<string, string>();
  return {
    getText: async (k) => texts.get(k) ?? null,
    setText: async (k, v) => void texts.set(k, v),
    putFile: async () => undefined,
    fileUrl: async () => null,
    removeFile: async () => undefined,
    clearAll: async () => texts.clear(),
  };
}

const mockClient = createLocalClient(new LocalDb(memoryKv(), LOCAL_USER_ID));
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockClient }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type Out = {
  matching_rows: number;
  returned: number;
  note?: string;
  rows: Record<string, unknown>[];
};

beforeAll(async () => {
  const c = mockClient;
  await c.from('body_metrics').insert(
    [80, 79.5, 79, 78.2].map((w, i) => ({
      id: id(10 + i),
      day: `2026-10-0${i + 1}`,
      weight_kg: w,
    })),
  );
  await c.from('body_goals').insert({ id: id(20), valid_from: '2026-10-01', target_weight_kg: 75 });
  await c.from('food_logs').insert(
    ['breakfast', 'lunch', 'lunch'].map((meal, i) => ({
      id: id(30 + i),
      day: '2026-10-02',
      meal,
      name: `Food ${i}`,
      grams: 100,
      kcal: 300,
      protein_g: 10 + i * 10,
      carbs_g: 0,
      fat_g: 0,
    })),
  );
  await c.from('exercises').insert({
    id: id(40),
    owner_id: LOCAL_USER_ID,
    name: 'Bench press test',
    primary_muscle: 'chest',
    equipment: 'barbell',
  });
  for (const [i, kg] of [100, 110].entries()) {
    const session = id(50 + i);
    await c.from('workout_sessions').insert({
      id: session,
      status: 'done',
      started_at: `2026-10-0${i + 1}T17:00:00Z`,
      ended_at: `2026-10-0${i + 1}T18:00:00Z`,
    });
    await c.from('session_sets').insert({
      id: id(60 + i),
      session_id: session,
      exercise_id: id(40),
      set_index: 0,
      weight_kg: kg,
      reps: 1,
      completed_at: `2026-10-0${i + 1}T17:10:00Z`,
    });
  }
});

describe('the assistant can explore all the data', () => {
  it('list_data: every table with what it holds, its columns and its size', async () => {
    const map = (await listData()) as {
      tables: { table: string; columns: string[]; rows?: number }[];
    };
    const body = map.tables.find((t) => t.table === 'body_metrics')!;
    expect(body.rows).toBe(4);
    expect(body.columns).toContain('weight_kg');
    expect(body.columns).not.toContain('user_id');
    expect(map.tables.map((t) => t.table)).toEqual(
      expect.arrayContaining(['body_goals', 'progress_photos', 'session_sets', 'exercise_records']),
    );
  });

  it('query_data: filters, columns, order and limit', async () => {
    const r = (await queryData({
      table: 'body_metrics',
      columns: ['day', 'weight_kg'],
      where: [{ column: 'day', op: '>=', value: '2026-10-02' }],
      order_by: [{ column: 'day', desc: true }],
      limit: 2,
    })) as Out;
    expect(r.matching_rows).toBe(3);
    expect(r.rows).toEqual([
      { day: '2026-10-04', weight_kg: 78.2 },
      { day: '2026-10-03', weight_kg: 79 },
    ]);
    expect(r.note).toMatch(/1 more/);
  });

  it('query_data: grouping with aggregates returns only the answer', async () => {
    const r = (await queryData({
      table: 'food_logs',
      group_by: ['meal'],
      aggregates: [{ fn: 'count' }, { fn: 'avg', column: 'protein_g' }],
      order_by: [{ column: 'meal' }],
    })) as Out;
    expect(r.rows).toEqual([
      { meal: 'breakfast', count: 1, avg_protein_g: 10 },
      { meal: 'lunch', count: 2, avg_protein_g: 25 },
    ]);
  });

  it('query_data: sets carry the exercise name, which can be searched', async () => {
    const r = (await queryData({
      table: 'session_sets',
      where: [{ column: 'exercise_name', op: 'contains', value: 'bench' }],
      aggregates: [{ fn: 'max', column: 'weight_kg' }],
    })) as Out;
    expect(r.rows).toEqual([{ max_weight_kg: 110 }]);
    expect(((await queryData({ table: 'body_goals' })) as Out).rows[0]).toMatchObject({
      target_weight_kg: 75,
    });
  });

  it('query_data: clear errors the model can fix', async () => {
    await expect(queryData({ table: 'secrets' })).rejects.toThrow(/must be one of/);
    await expect(
      queryData({ table: 'body_metrics', where: [{ column: 'weigth', op: '=', value: 1 }] }),
    ).rejects.toThrow(/unknown column "weigth".*weight_kg/);
  });

  it('get_strength: score and exercise change like the Progress screen', async () => {
    const s = (await strengthReport({ period: '4w' }, '2026-10-10')) as {
      strength_score_pct: number;
      exercises: { exercise: string; change_pct: number; heaviest_ever_kg: number }[];
    };
    expect(s.strength_score_pct).toBe(10);
    expect(s.exercises[0]).toMatchObject({
      exercise: 'Bench press test',
      change_pct: 10,
      heaviest_ever_kg: 110,
    });
  });
});

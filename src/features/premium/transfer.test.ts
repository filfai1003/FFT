import { createLocalClient } from '@/lib/local-db/client';
import { LocalDb, type Kv } from '@/lib/local-db/engine';
import { getLocalClient, readLocalTables } from '@/lib/local-db';
import { downloadToDevice, uploadToServer } from './transfer';

const U = '11111111-2222-4333-8444-555555555555';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function memoryKv(): Kv & { files: Map<string, Uint8Array> } {
  const texts = new Map<string, string>();
  const files = new Map<string, Uint8Array>();
  return {
    files,
    getText: async (k) => texts.get(k) ?? null,
    setText: async (k, v) => void texts.set(k, v),
    putFile: async (k, b) => void files.set(k, b),
    fileUrl: async (k) => (files.has(k) ? `mem:${k}` : null),
    removeFile: async (k) => void files.delete(k),
    clearAll: async () => {
      texts.clear();
      files.clear();
    },
  };
}

// The phone: the module's own kv is replaced by memory (made inside the factory: mocks are hoisted).
jest.mock('@/lib/local-db/kv', () => {
  const texts = new Map<string, string>();
  const files = new Map<string, Uint8Array>();
  return {
    kv: {
      files,
      getText: async (k: string) => texts.get(k) ?? null,
      setText: async (k: string, v: string) => void texts.set(k, v),
      putFile: async (k: string, b: Uint8Array) => void files.set(k, b),
      fileUrl: async (k: string) => (files.has(k) ? `mem:${k}` : null),
      removeFile: async (k: string) => void files.delete(k),
      clearAll: async () => undefined,
    },
  };
});
const mockPhone = (jest.requireMock('@/lib/local-db/kv') as { kv: ReturnType<typeof memoryKv> }).kv;

// The server: another on-device database standing in for Postgres + Storage.
const serverDb = new LocalDb(memoryKv(), U);
const serverFiles = new Map<string, Uint8Array>();
const mockServer = {
  ...createLocalClient(serverDb),
  rpc: async (name: string) => {
    if (name !== 'clear_my_online_data') return { data: null, error: { message: name } };
    await serverDb.wipeTables();
    return { data: null, error: null };
  },
  storage: {
    from: (bucket: string) => ({
      upload: async (path: string, body: ArrayBuffer) => {
        serverFiles.set(`${bucket}/${path}`, new Uint8Array(body));
        return { data: { path }, error: null };
      },
      download: async (path: string) => {
        const bytes = serverFiles.get(`${bucket}/${path}`);
        return bytes
          ? { data: new Blob([bytes as unknown as BlobPart], { type: 'image/jpeg' }), error: null }
          : { data: null, error: { message: 'not found' } };
      },
      remove: async (paths: string[]) => {
        for (const p of paths) serverFiles.delete(`${bucket}/${p}`);
        return { data: null, error: null };
      },
    }),
  },
};
jest.mock('@/lib/supabase', () => ({ getAuthClient: () => mockServer }));
// (mockServer is read when a test runs, after this file has been evaluated.)

beforeAll(() => {
  global.fetch = jest.fn(async (url: string) => {
    const bytes = mockPhone.files.get(String(url).replace(/^mem:/, ''));
    return { arrayBuffer: async () => bytes!.slice().buffer } as unknown as Response;
  }) as unknown as typeof fetch;
});

const BENCH = 'ca7a1090-0000-4000-8000-8444f9e37bc7';

describe('moving an account between the phone and the server', () => {
  it('premium starts: every row and photo goes online, the phone copy is erased', async () => {
    const phone = getLocalClient(U);
    await phone.from('workout_plans').insert({ id: id(1), name: 'PPL', status: 'active' });
    await phone.from('plan_days').insert({ id: id(2), plan_id: id(1), position: 0, name: 'Push' });
    await phone
      .from('plan_exercises')
      .insert({ id: id(3), plan_day_id: id(2), exercise_id: BENCH, position: 0 });
    await phone
      .from('foods')
      .insert({ id: id(4), owner_id: U, name: 'My oats', kcal_100g: 380 });
    await phone.from('food_logs').insert({
      id: id(5),
      day: '2026-10-14',
      meal: 'breakfast',
      food_id: id(4),
      name: 'My oats',
      grams: 80,
      kcal: 304,
    });
    await phone.storage
      .from('progress-photos')
      .upload('00000000-0000-4000-8000-0000000000a1/front.jpg', new Uint8Array([1, 2, 3]));
    await phone.from('progress_photos').insert({
      id: id(6),
      day: '2026-10-14',
      pose: 'front',
      storage_path: '00000000-0000-4000-8000-0000000000a1/front.jpg',
    });
    await phone.from('profiles').update({ name: 'Sam' }).eq('id', U);

    await uploadToServer(U);

    const online = serverDb.tables;
    expect(online.workout_plans.map((p) => p.name)).toEqual(['PPL']);
    expect(online.plan_exercises[0].exercise_id).toBe(BENCH);
    expect(online.food_logs[0].food_id).toBe(id(4));
    expect(online.progress_photos[0].storage_path).toBe(`${U}/front.jpg`);
    expect([...serverFiles.get(`progress-photos/${U}/front.jpg`)!]).toEqual([1, 2, 3]);
    expect(online.profiles.find((p) => p.id === U)?.name).toBe('Sam');

    const left = await readLocalTables(U);
    expect(left.workout_plans).toEqual([]);
    expect(left.food_logs).toEqual([]);
    expect(left.exercises.length).toBeGreaterThan(60); // the catalogue stays
  });

  it('premium ends: everything comes back to the phone, the server copy is erased', async () => {
    await downloadToDevice(U);

    const back = await readLocalTables(U);
    expect(back.workout_plans.map((p) => p.name)).toEqual(['PPL']);
    expect(back.plan_days.map((d) => d.name)).toEqual(['Push']);
    expect(back.foods.find((f) => f.id === id(4))?.owner_id).toBe(U);
    expect(back.food_logs[0].kcal).toBe(304);
    expect(back.progress_photos[0].storage_path).toBe(`${U}/front.jpg`);
    expect(mockPhone.files.has(`progress-photos/${U}/front.jpg`)).toBe(true);
    expect(back.profiles.find((p) => p.id === U)?.name).toBe('Sam');

    expect(serverDb.tables.workout_plans).toEqual([]);
    expect(serverDb.tables.food_logs).toEqual([]);
    expect(serverFiles.size).toBe(0);
  });

  it('a second phone does not take over the active plan already online', async () => {
    await mockServer
      .from('workout_plans')
      .insert({ id: id(10), user_id: U, name: 'Online plan', status: 'active' });
    // The phone still has PPL active (brought back by the previous test).
    await uploadToServer(U);
    const plans = Object.fromEntries(serverDb.tables.workout_plans.map((p) => [p.name, p.status]));
    expect(plans).toEqual({ 'Online plan': 'active', PPL: 'archived' });
  });
});

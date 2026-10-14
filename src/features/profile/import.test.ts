import { strToU8, zipSync } from 'fflate';
import { getLocalClient, getLocalDb } from '@/lib/local-db';
import { importExport, readExport } from './import';

const U = '22222222-3333-4444-8555-666666666666';
const OTHER = '99999999-3333-4444-8555-666666666666';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
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
      readFile: async (k: string) => files.get(k) ?? null,
      removeFile: async (k: string) => void files.delete(k),
      clearAll: async () => undefined,
    },
  };
});
jest.mock('@/lib/current-user', () => ({ getCurrentUserId: () => U, setCurrentUserId: () => {} }));

const zipOf = (data: Record<string, unknown>, photos: Record<string, Uint8Array> = {}) =>
  zipSync({
    'data.json': strToU8(JSON.stringify({ exportedAt: '2026-10-15', ...data })),
    ...Object.fromEntries(Object.entries(photos).map(([n, b]) => [`photos/${n}`, b])),
  });

const at = (h: number) => `2026-10-${String(10 + h).padStart(2, '0')}T08:00:00.000Z`;

describe('importing an export', () => {
  it('refuses a file that is not an FFT export', () => {
    expect(() => readExport(zipSync({ 'notes.txt': strToU8('hi') }))).toThrow('not an FFT export');
  });

  it("an export of another account comes in as this account's data, with its photos", async () => {
    const zip = zipOf(
      {
        workout_plans: [
          { id: id(1), user_id: OTHER, name: 'PPL', status: 'active', updated_at: at(1) },
        ],
        plan_days: [
          {
            id: id(2),
            user_id: OTHER,
            plan_id: id(1),
            position: 0,
            name: 'Push',
            updated_at: at(1),
          },
        ],
        body_metrics: [
          { id: id(3), user_id: OTHER, day: '2026-10-01', weight_kg: 80, updated_at: at(1) },
        ],
        progress_photos: [
          {
            id: id(4),
            user_id: OTHER,
            day: '2026-10-01',
            pose: 'front',
            storage_path: `${OTHER}/a.jpg`,
            updated_at: at(1),
          },
        ],
      },
      { '2026-10-01-front.jpg': new Uint8Array([7, 7]) },
    );
    const r = await importExport(zip, U);
    expect(r).toMatchObject({ rows: 4, photos: 1 });
    const t = getLocalDb(U).tables;
    expect(t.workout_plans.find((p) => p.id === id(1))).toMatchObject({ user_id: U, name: 'PPL' });
    expect(t.progress_photos[0].storage_path).toBe(`${U}/a.jpg`);
  });

  it('nothing is deleted; for the same item the newest version wins', async () => {
    await getLocalClient(U).from('body_metrics').update({ weight_kg: 79 }).eq('id', id(3)); // now: newer here
    const older = zipOf({
      body_metrics: [{ id: id(3), day: '2026-10-01', weight_kg: 85, updated_at: at(2) }],
    });
    expect((await importExport(older, U)).skipped).toBe(1);
    expect(getLocalDb(U).tables.body_metrics.find((b) => b.id === id(3))?.weight_kg).toBe(79);

    const newer = zipOf({
      body_metrics: [
        { id: id(3), day: '2026-10-01', weight_kg: 78, updated_at: '2099-01-01T00:00:00.000Z' },
      ],
    });
    await importExport(newer, U);
    expect(getLocalDb(U).tables.body_metrics.find((b) => b.id === id(3))?.weight_kg).toBe(78);
    expect(getLocalDb(U).tables.workout_plans.some((p) => p.id === id(1))).toBe(true);
  });

  it('a second active plan comes in archived (only one plan can be active)', async () => {
    const zip = zipOf({
      workout_plans: [{ id: id(9), name: 'Other plan', status: 'active', updated_at: at(3) }],
    });
    await importExport(zip, U);
    const plans = getLocalDb(U).tables.workout_plans;
    expect(plans.find((p) => p.id === id(9))?.status).toBe('archived');
    expect(plans.filter((p) => p.status === 'active')).toHaveLength(1);
  });
});

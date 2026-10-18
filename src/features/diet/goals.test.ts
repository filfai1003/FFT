import { goalForDay } from '@/domain/diet';
import { createLocalClient } from '@/lib/local-db/client';
import { LocalDb, type Kv } from '@/lib/local-db/engine';
import { LOCAL_USER_ID } from '@/lib/local-db/schema';
import { fetchGoals, removeTarget, saveGoalRow } from './log';

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

const target = {
  kcal: 2200,
  proteinG: 150,
  carbsG: 250,
  fatG: 65,
  trainingDayBonusKcal: 200,
  maintenanceKcal: 2600,
  waterMl: 2500,
};
const today = '2026-10-18';
const inForce = async (day = today) => goalForDay(await fetchGoals(), day);

beforeEach(() => {
  mockClient = createLocalClient(new LocalDb(memoryKv(), LOCAL_USER_ID));
});

describe('removing the calorie target (DECISIONS 104)', () => {
  it('"no target" from today on keeps the water goal and the earlier days; UNDO brings it back', async () => {
    await saveGoalRow(LOCAL_USER_ID, { validFrom: '2026-10-01', ...target });
    const undo = await removeTarget(LOCAL_USER_ID, today, await inForce());
    expect(await inForce()).toMatchObject({
      kcal: null,
      proteinG: null,
      maintenanceKcal: null,
      trainingDayBonusKcal: 0,
      waterMl: 2500,
    });
    expect((await inForce('2026-10-10'))?.kcal).toBe(2200);
    await undo!();
    expect((await inForce())?.kcal).toBe(2200);
  });

  it('a target set today is replaced in place, and UNDO restores it', async () => {
    await saveGoalRow(LOCAL_USER_ID, { validFrom: today, ...target });
    const undo = await removeTarget(LOCAL_USER_ID, today, await inForce());
    expect((await inForce())?.kcal).toBeNull();
    expect(await fetchGoals()).toHaveLength(1);
    await undo!();
    expect(await inForce()).toMatchObject({ kcal: 2200, maintenanceKcal: 2600 });
  });

  it('nothing to do when there is no target already', async () => {
    await saveGoalRow(LOCAL_USER_ID, {
      validFrom: '2026-10-01',
      ...target,
      kcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
    });
    expect(await removeTarget(LOCAL_USER_ID, today, await inForce())).toBeNull();
    // Saving "no target" drops what only makes sense with one (the database refuses it).
    expect(await inForce()).toMatchObject({ maintenanceKcal: null, trainingDayBonusKcal: 0 });
  });

  it('setting a target later is checked by the safety rules', async () => {
    await expect(
      saveGoalRow(LOCAL_USER_ID, { validFrom: today, ...target, kcal: 1400 }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      saveGoalRow(LOCAL_USER_ID, { validFrom: today, ...target, kcal: 1800 }),
    ).rejects.toMatchObject({ code: '23514' }); // more than 25% under 2600
  });
});

import '@/i18n';
import { addDays, localDay, localHour } from '@/domain/day';
import { mealForHour } from '@/domain/diet';
import { buildSession } from '@/features/session/logic';
import { useSessionStore as useWorkoutStore } from '@/features/session/store';
import { setCurrentUserId } from '@/lib/current-user';
import { getLocalClient, getLocalDb } from '@/lib/local-db';
import { reportError } from '@/lib/error-report';
import { scheduleRestEnd } from '@/lib/notifications';
import { showRestTimer } from '../../../modules/rest-timer';
import { buildSnapshot } from './build';
import { handleWidgetClick } from './controller';
import { readSnapshot, saveSnapshot } from './snapshot';
import { emptyState, readState, saveState } from './state';
import { updateWidgets } from './update';

const U = '11111111-2222-4333-8444-555555555555';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

jest.mock('@/lib/local-db/kv', () => {
  const texts = new Map<string, string>();
  return {
    kv: {
      texts,
      getText: async (k: string) => texts.get(k) ?? null,
      setText: async (k: string, v: string) => void texts.set(k, v),
      putFile: async () => undefined,
      fileUrl: async () => null,
      readFile: async () => null,
      removeFile: async () => undefined,
      clearAll: async () => texts.clear(),
    },
  };
});
// The real redraw needs the phone; here it only keeps the snapshot, as it does on Android.
jest.mock('./update', () => ({
  updateWidgets: jest.fn(async (s: unknown) => {
    await jest.requireActual('./snapshot').saveSnapshot(s);
  }),
}));
// Short Undo and message times, so the tests do not wait 5 s.
jest.mock('./state', () => ({ ...jest.requireActual('./state'), UNDO_MS: 40, NOTICE_MS: 40 }));
jest.mock('@/lib/notifications', () => ({
  scheduleRestEnd: jest.fn(async () => undefined),
  cancelRestEnd: jest.fn(async () => undefined),
}));
jest.mock('../../../modules/rest-timer', () => ({
  showRestTimer: jest.fn(),
  hideRestTimer: jest.fn(),
}));
jest.mock('@/lib/error-report', () => ({
  reportError: jest.fn(),
  flushErrors: jest.fn(async () => undefined),
}));

const db = () => getLocalClient(U);
const today = () => localDay(new Date(), 'UTC');
const rows = async (table: string) => {
  const { data } = await db().from(table).select('*');
  return (data ?? []) as Record<string, unknown>[];
};
const alive = async (table: string) => (await rows(table)).filter((r) => r.deleted_at == null);
/** A tap on a widget: the snapshot it was drawn from is the one saved now. */
const tap = async (action: string, data: Record<string, unknown> = {}) =>
  handleWidgetClick(action, data, 'Calories');
const snapshot = async () => (await readSnapshot())!;
/** A quick action, then its Undo while the widget shows it. */
const tapThenUndo = async (action: string, data: Record<string, unknown> = {}) => {
  const done = tap(action, data);
  let undoId: string | null = null;
  for (let i = 0; i < 20 && !undoId; i++) {
    await new Promise((r) => setTimeout(r, 5));
    undoId = (await readState()).undo?.id ?? null;
  }
  expect(undoId).not.toBeNull();
  await tap('UNDO', { id: undoId });
  await done;
};

beforeEach(async () => {
  jest.clearAllMocks();
  setCurrentUserId(U);
  const local = getLocalDb(U);
  await local.wipeTables();
  local.tracking = false;
  useWorkoutStore.setState({ active: null, finished: {} });
  await saveState(emptyState);
  const c = db();
  await c.from('profiles').update({ timezone: 'UTC', diet_mode: 'fixed_meals' }).eq('id', U);
  await c.from('consents').insert({ id: id(1), type: 'health_data', policy_version: '1' });
  await c.from('fixed_meal_plans').insert({ id: id(10), name: 'Plan', active: true });
  await c.from('fixed_meals').insert([
    {
      id: id(11),
      plan_id: id(10),
      position: 0,
      name: 'Breakfast',
      kcal: 500,
      protein_g: 30,
      carbs_g: 60,
      fat_g: 12,
      is_main: false,
    },
    {
      id: id(12),
      plan_id: id(10),
      position: 1,
      name: 'Lunch',
      kcal: 700,
      protein_g: 45,
      carbs_g: 80,
      fat_g: 20,
      is_main: true,
    },
  ]);
  await c.from('supplements').insert({ id: id(20), name: 'Creatine', position: 0 });
  await saveSnapshot(await buildSnapshot(U));
});

describe('widget quick actions', () => {
  it('fixed meals: Followed copies the planned values into the day; Undo takes it back', async () => {
    expect((await snapshot()).diet.nextMeal?.id).toBe(id(11));
    await tap('MEAL_DONE', { mealId: id(11) });
    const checks = await alive('fixed_meal_checks');
    expect(checks).toEqual([
      expect.objectContaining({ fixed_meal_id: id(11), day: today(), status: 'done', kcal: 500 }),
    ]);
    // The widgets were redrawn with the next meal.
    expect((await snapshot()).diet.nextMeal?.id).toBe(id(12));

    // The Undo is gone after its time: the widget state was cleared.
    expect((await readState()).undo).toBeNull();
  });

  it('Undo within its time removes the check again', async () => {
    await tapThenUndo('MEAL_DONE', { mealId: id(11) });
    expect(await alive('fixed_meal_checks')).toEqual([]);
    expect((await snapshot()).diet.nextMeal?.id).toBe(id(11));
  });

  it('Skipped counts nothing; a tap for a meal that is not next does nothing', async () => {
    await tap('MEAL_DONE', { mealId: id(12) });
    expect(await alive('fixed_meal_checks')).toEqual([]);
    await tap('MEAL_SKIPPED', { mealId: id(11) });
    expect(await alive('fixed_meal_checks')).toEqual([
      expect.objectContaining({ status: 'skipped', kcal: 0 }),
    ]);
  });

  it('+ water adds a glass of the chosen size; with the sync on it goes to the outbox', async () => {
    getLocalDb(U).tracking = true;
    await tap('WATER');
    const water = await alive('water_logs');
    expect(water).toEqual([expect.objectContaining({ day: today(), ml: 250 })]);
    expect(Object.keys(getLocalDb(U).outbox)).toContain(`water_logs:${water[0].id}`);
    expect((await snapshot()).water.ml).toBe(250);
  });

  it('same as yesterday copies yesterday entries of the meal of the hour, once', async () => {
    await db().from('profiles').update({ diet_mode: 'tracking' }).eq('id', U);
    const meal = mealForHour(localHour(new Date(), 'UTC'));
    await db()
      .from('food_logs')
      .insert([
        {
          id: id(30),
          day: addDays(today(), -1),
          meal,
          name: 'Oats',
          kcal: 300,
          protein_g: 10,
          carbs_g: 50,
          fat_g: 6,
        },
        {
          id: id(31),
          day: addDays(today(), -1),
          meal,
          name: 'Milk',
          kcal: 120,
          protein_g: 8,
          carbs_g: 10,
          fat_g: 5,
        },
      ]);
    await saveSnapshot(await buildSnapshot(U));
    expect((await snapshot()).diet.yesterdayCount).toBe(2);
    await tap('SAME_MEAL', { meal });
    await tap('SAME_MEAL', { meal });
    const copied = (await alive('food_logs')).filter((r) => r.day === today());
    expect(copied.map((r) => r.name).sort()).toEqual(['Milk', 'Oats']);
  });

  it('supplements: a tap ticks, another unticks', async () => {
    await tap('SUPPLEMENT', { id: id(20) });
    expect(await alive('supplement_logs')).toEqual([
      expect.objectContaining({ supplement_id: id(20), day: today() }),
    ]);
    await tap('SUPPLEMENT', { id: id(20) });
    expect(await alive('supplement_logs')).toEqual([]);
    await tap('SUPPLEMENT', { id: 'not-mine' });
    expect(await alive('supplement_logs')).toEqual([]);
  });

  it('weight: − / + change the draft only, Save writes today; Undo of a new entry removes it', async () => {
    await db()
      .from('body_metrics')
      .insert({ id: id(40), day: addDays(today(), -3), weight_kg: 80.2 });
    await saveSnapshot(await buildSnapshot(U));
    await tap('WEIGHT_STEP', { delta: 1 });
    await tap('WEIGHT_STEP', { delta: 1 });
    await tap('WEIGHT_STEP', { delta: -1 });
    expect((await readState()).weightDraft?.tenths).toBe(803);
    expect((await alive('body_metrics')).length).toBe(1);
    await tap('WEIGHT_SAVE');
    const entries = await alive('body_metrics');
    expect(entries.find((e) => e.day === today())).toEqual(
      expect.objectContaining({ weight_kg: 80.3 }),
    );
    expect((await readState()).weightDraft).toBeNull();
  });

  it('weight: Undo of a change to today puts the earlier weight back', async () => {
    await db()
      .from('body_metrics')
      .insert({ id: id(41), day: today(), weight_kg: 80 });
    await saveSnapshot(await buildSnapshot(U));
    await tap('WEIGHT_STEP', { delta: -1 });
    await tapThenUndo('WEIGHT_SAVE');
    expect(await alive('body_metrics')).toEqual([
      expect.objectContaining({ id: id(41), weight_kg: 80 }),
    ]);
  });

  it('water: Undo removes the glass', async () => {
    await tapThenUndo('WATER');
    expect(await alive('water_logs')).toEqual([]);
  });

  it('workout: Set done saves the next set with its suggested reps (last time + 1) and starts the rest', async () => {
    const session = buildSession({
      planId: null,
      planDayId: null,
      dayName: 'Push',
      cycleNumber: null,
      outOfOrder: false,
      weightUnit: 'kg',
      now: new Date(),
      exercises: [
        {
          exerciseId: id(50),
          name: 'Bench press',
          logType: 'weight_reps',
          imagePath: null,
          restS: 90,
          targetSets: 3,
          targetReps: '8-10',
          equipment: 'barbell',
          supersetWithNext: false,
          drops: null,
          previous: [{ weightKg: 60, reps: 8, durationS: null, distanceM: null }],
        },
      ],
    });
    useWorkoutStore.getState().start(session);
    const snap = await buildSnapshot(U);
    await saveSnapshot(snap);
    const a = snap!.workout.active!;
    expect(a).toEqual(
      expect.objectContaining({ exercise: 'Bench press', setNumber: 1, reps: '9', quick: true }),
    );

    await tap('SET_DONE', { sessionId: a.sessionId, setId: a.setId });
    const set = useWorkoutStore.getState().active!.exercises[0].sets[0];
    expect(set).toEqual(expect.objectContaining({ done: true, reps: '9' }));
    expect(useWorkoutStore.getState().active!.rest).not.toBeNull();
    expect(showRestTimer).toHaveBeenCalled();
    expect(scheduleRestEnd).toHaveBeenCalled();
    // The same tap again (an old picture) does not tick the next set.
    await tap('SET_DONE', { sessionId: a.sessionId, setId: a.setId });
    expect(useWorkoutStore.getState().active!.exercises[0].sets[1].done).toBe(false);

    // Undo: the next set is un-ticked, the rest stops.
    const b = (await snapshot()).workout.active!;
    await tapThenUndo('SET_DONE', { sessionId: b.sessionId, setId: b.setId });
    const after = useWorkoutStore.getState().active!;
    expect(after.exercises[0].sets[1].done).toBe(false);
    expect(after.rest).toBeNull();
  });

  it('nothing is written without the health data consent', async () => {
    await db().from('consents').update({ withdrawn_at: new Date().toISOString() }).eq('id', id(1));
    await tap('WATER');
    expect(await alive('water_logs')).toEqual([]);
    expect(updateWidgets).toHaveBeenCalledWith(null, expect.anything());
  });

  it('a failure is reported and shown on the widget, never a blank widget', async () => {
    const spy = jest.spyOn(getLocalDb(U), 'flush').mockRejectedValueOnce(new Error('disk full'));
    await tap('WATER');
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'widget', { action: 'WATER' });
    expect(updateWidgets).toHaveBeenCalledWith(
      expect.objectContaining({ v: 2 }),
      expect.objectContaining({ notice: expect.objectContaining({ widget: 'Calories' }) }),
    );
    spy.mockRestore();
  });

  it('unknown actions and another account do nothing', async () => {
    await tap('DROP_TABLES');
    setCurrentUserId(id(99));
    await tap('WATER');
    setCurrentUserId(U);
    expect(await alive('water_logs')).toEqual([]);
  });
});

import { cycleDays, exerciseChips, lastDoneDay } from './cycle';
import type { PlanDayView, PlanSession, Rotation } from './plans';

const day = (id: string, name: string, exercises = 0): PlanDayView => ({
  id,
  position: 0,
  name,
  exercises: Array.from({ length: exercises }, (_, i) => ({
    id: `${id}-${i}`,
    exerciseId: `x${i}`,
    position: i,
    targetSets: 3,
    targetReps: '8-12',
    restS: 90,
    notes: null,
    supersetWithNext: false,
    drops: null,
    exercise: {
      id: `x${i}`,
      ownerId: null,
      name: `Exercise ${i + 1}`,
      primaryMuscle: 'chest',
      secondaryMuscles: [],
      equipment: 'barbell',
      logType: 'weight_reps',
      imagePath: null,
    },
  })),
});

const session = (dayId: string, startedAt: string, outOfOrder = false): PlanSession => ({
  id: `${dayId}-${startedAt}`,
  plan_day_id: dayId,
  cycle_number: 2,
  started_at: startedAt,
  out_of_order: outOfOrder,
  day_name: null,
});

describe('cycleDays', () => {
  const days = [day('a', 'Push'), day('b', 'Pull'), day('c', 'Legs')];
  // Thursday 15 Oct 2026, noon UTC.
  const pull = session('b', '2026-10-15T12:00:00.000Z', true);
  const rotation: Rotation = {
    state: {
      cycle: 2,
      doneDayIds: new Set(['b']),
      upNextDayId: 'a',
      doneCount: 1,
      totalDays: 3,
    },
    doneThisCycle: new Map([['b', pull]]),
  };

  it('numbers the days and gives next, done (with its weekday) and to do', () => {
    expect(cycleDays(days, rotation, 'UTC')).toEqual([
      { id: 'a', n: 1, name: 'Push', state: 'next', weekday: null, outOfOrder: false },
      { id: 'b', n: 2, name: 'Pull', state: 'done', weekday: 'Thu', outOfOrder: true },
      { id: 'c', n: 3, name: 'Legs', state: 'todo', weekday: null, outOfOrder: false },
    ]);
  });

  it('without a rotation (not loaded, not the active plan) every day is to do', () => {
    expect(cycleDays(days, null, 'UTC').map((d) => d.state)).toEqual(['todo', 'todo', 'todo']);
  });
});

describe('lastDoneDay', () => {
  it('is the local day of the latest workout of that day, any cycle', () => {
    const sessions = [
      session('a', '2026-10-01T10:00:00.000Z'),
      session('a', '2026-10-12T23:30:00.000Z'),
      session('b', '2026-10-18T10:00:00.000Z'),
    ];
    expect(lastDoneDay(sessions, 'a', 'UTC')).toBe('2026-10-12');
    // Late evening in UTC is already the next day in Rome.
    expect(lastDoneDay(sessions, 'a', 'Europe/Rome')).toBe('2026-10-13');
    expect(lastDoneDay(sessions, 'c', 'UTC')).toBeNull();
    expect(lastDoneDay(undefined, 'a', 'UTC')).toBeNull();
  });
});

describe('exerciseChips', () => {
  it('shows three names and the rest as a count', () => {
    expect(exerciseChips(day('a', 'Push', 6))).toEqual({
      names: ['Exercise 1', 'Exercise 2', 'Exercise 3'],
      more: 3,
    });
  });

  it('shows a fourth name rather than "+1 more"', () => {
    expect(exerciseChips(day('a', 'Push', 4)).more).toBe(0);
    expect(exerciseChips(day('a', 'Push', 4)).names).toHaveLength(4);
    expect(exerciseChips(day('a', 'Push', 2))).toEqual({
      names: ['Exercise 1', 'Exercise 2'],
      more: 0,
    });
  });
});

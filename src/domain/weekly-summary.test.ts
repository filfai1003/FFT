import type { GamificationInput } from './gamification';
import { buildWeeklySummary, shiftWeek, type WeeklySummaryInput } from './weekly-summary';

// Week of Monday 2026-10-19 to Sunday 2026-10-25; today is Wednesday 21.
const activity = (patch: Partial<Omit<GamificationInput, 'today'>> = {}) => ({
  loggedDays: new Set(['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']),
  workouts: [
    { id: 'w0', day: '2026-10-17', hour: 18 },
    { id: 'w1', day: '2026-10-19', hour: 18 },
    { id: 'w2', day: '2026-10-21', hour: 7 },
  ],
  dietOnTargetDays: new Set(['2026-10-18', '2026-10-19', '2026-10-20']),
  checkInDays: new Set<string>(),
  exerciseDays: [
    { exerciseId: 'bench', day: '2026-10-12', bestWeightKg: 80, bestE1rmKg: 90 },
    { exerciseId: 'bench', day: '2026-10-19', bestWeightKg: 85, bestE1rmKg: 92 },
    { exerciseId: 'squat', day: '2026-10-14', bestWeightKg: 100, bestE1rmKg: 110 },
    { exerciseId: 'squat', day: '2026-10-21', bestWeightKg: 102, bestE1rmKg: 111 },
  ],
  ...patch,
});

const input = (patch: Partial<WeeklySummaryInput> = {}): WeeklySummaryInput => ({
  day: '2026-10-21',
  today: '2026-10-21',
  weekStart: 'mon',
  activity: activity(),
  planDays: 4,
  weights: [
    { day: '2026-10-12', kg: 81 },
    { day: '2026-10-18', kg: 80.6 },
    { day: '2026-10-20', kg: 80.4 },
    { day: '2026-10-21', kg: 80.2 },
  ],
  ...patch,
});

describe('buildWeeklySummary', () => {
  it('sums up the current week so far', () => {
    const s = buildWeeklySummary(input());
    expect(s).toEqual(
      expect.objectContaining({
        from: '2026-10-19',
        to: '2026-10-25',
        asOf: '2026-10-21',
        isCurrent: true,
        daysPassed: 3,
        workouts: 2,
        trainedDays: ['2026-10-19', '2026-10-21'],
        planned: 4,
        dietOnTarget: 2,
        streak: 5,
      }),
    );
    // Against the last weight before the week.
    expect(s.weight).toEqual({ endKg: 80.2, startKg: 80.6, deltaKg: -0.4 });
  });

  it('the best record of the week is the biggest gain', () => {
    const s = buildWeeklySummary(input());
    expect(s.bestRecord).toEqual(
      expect.objectContaining({ exerciseId: 'bench', kind: 'max', valueKg: 85 }),
    );
  });

  it('badges earned this week and the closest ones', () => {
    const s = buildWeeklySummary(
      input({ activity: activity({ supplementTicks: ['2026-10-20'] }) }),
    );
    // First workout was before the week; the first supplement tick came this week.
    expect(s.badgesEarned.map((b) => b.id)).toContain('supplements_1');
    expect(s.badgesEarned.map((b) => b.id)).not.toContain('first_workout');
    expect(s.closestBadges).toHaveLength(3);
    expect(s.closestBadges.every((b) => !b.earned)).toBe(true);
  });

  it('a past week counts to its last day', () => {
    const s = buildWeeklySummary(input({ day: shiftWeek('2026-10-19', -1) }));
    expect(s).toEqual(
      expect.objectContaining({
        from: '2026-10-12',
        asOf: '2026-10-18',
        isCurrent: false,
        daysPassed: 7,
        workouts: 1,
        dietOnTarget: 1,
      }),
    );
    expect(s.weight).toEqual({ endKg: 80.6, startKg: 81, deltaKg: -0.4 });
  });

  it('no weight this week, no plan, Sunday weeks', () => {
    const s = buildWeeklySummary(
      input({ weekStart: 'sun', planDays: null, weights: [{ day: '2026-10-01', kg: 80 }] }),
    );
    expect(s.from).toBe('2026-10-18');
    expect(s.planned).toBeNull();
    expect(s.weight).toBeNull();
    expect(s.workouts).toBe(2);
  });

  it('one weight only: no change', () => {
    const s = buildWeeklySummary(input({ weights: [{ day: '2026-10-20', kg: 80 }] }));
    expect(s.weight).toEqual({ endKg: 80, startKg: null, deltaKg: null });
  });
});

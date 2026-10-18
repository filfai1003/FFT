import {
  communityPeriodEnd,
  communityPeriodStart,
  communityScores,
  daysLeft,
  movement,
  topPercent,
  type ScoreInput,
} from './community';

const TODAY = '2026-10-14'; // Wednesday

const input = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  today: TODAY,
  workouts: [],
  dietOnTargetDays: new Set(),
  daily: [],
  planDays: 0,
  muscleOf: () => 'chest',
  ...over,
});

const pick = (
  scores: ReturnType<typeof communityScores>,
  period: string,
  metric: string,
  subject = '',
) => scores.find((s) => s.period === period && s.metric === metric && s.subject === subject)?.value;

describe('community periods', () => {
  it('weeks start on Monday for everyone; months on the 1st', () => {
    expect(communityPeriodStart('week', TODAY)).toBe('2026-10-12');
    expect(communityPeriodStart('week', '2026-10-18')).toBe('2026-10-12');
    expect(communityPeriodStart('month', TODAY)).toBe('2026-10-01');
    expect(communityPeriodEnd('month', '2026-02-01')).toBe('2026-02-28');
    expect(daysLeft('month', TODAY)).toBe(17);
    expect(daysLeft('week', TODAY)).toBe(4);
  });
});

describe('community scores (what is sent)', () => {
  it('workouts count, at most two a day', () => {
    const s = communityScores(
      input({
        workouts: [
          { day: '2026-10-13', planId: null },
          { day: '2026-10-13', planId: null },
          { day: '2026-10-13', planId: null },
          { day: '2026-10-02', planId: null },
        ],
      }),
    );
    expect(pick(s, 'week', 'workouts')).toBe(2);
    expect(pick(s, 'month', 'workouts')).toBe(3);
  });

  it('diet: days on target over the days passed, today only once it counts', () => {
    const s = communityScores(input({ dietOnTargetDays: new Set(['2026-10-12', '2026-10-13']) }));
    expect(pick(s, 'week', 'diet')).toBe(100);
    const s2 = communityScores(
      input({ dietOnTargetDays: new Set(['2026-10-12', '2026-10-13', TODAY]) }),
    );
    expect(pick(s2, 'month', 'diet')).toBe(21.4);
  });

  it('training: plan workouts against the plan days per week; none without a plan', () => {
    expect(pick(communityScores(input()), 'week', 'training')).toBeUndefined();
    const s = communityScores(
      input({
        planDays: 4,
        workouts: [
          { day: '2026-10-12', planId: 'p' },
          { day: '2026-10-13', planId: null },
        ],
      }),
    );
    // 4 days a week, 3 days passed: 2 planned (rounded), 1 done from the plan.
    expect(pick(s, 'week', 'training')).toBe(50);
  });

  it('strength: overall, per group and per exercise, only exercises done on two days', () => {
    const s = communityScores(
      input({
        daily: [
          { exerciseId: 'bench', day: '2026-10-02', bestE1rmKg: 100, sets: 3, volumeKg: 0 },
          { exerciseId: 'bench', day: '2026-10-13', bestE1rmKg: 105, sets: 3, volumeKg: 0 },
          { exerciseId: 'squat', day: '2026-10-13', bestE1rmKg: 140, sets: 3, volumeKg: 0 },
        ],
      }),
    );
    expect(pick(s, 'month', 'strength')).toBe(5);
    expect(pick(s, 'month', 'strength', 'group:chest')).toBe(5);
    expect(pick(s, 'month', 'strength', 'exercise:bench')).toBe(5);
    expect(pick(s, 'month', 'strength', 'exercise:squat')).toBeUndefined();
    // Only one day of bench this week: no weekly strength score.
    expect(pick(s, 'week', 'strength')).toBeUndefined();
    // Never weights: only percentages and counts leave the device.
    for (const x of s)
      expect(Object.keys(x).sort()).toEqual([
        'metric',
        'period',
        'period_start',
        'subject',
        'value',
      ]);
  });
});

describe('places', () => {
  it('movement words and top percent', () => {
    expect(movement(4, 6)).toEqual({ kind: 'up', n: 2 });
    expect(movement(5, 4)).toEqual({ kind: 'down', n: 1 });
    expect(movement(3, 3)).toEqual({ kind: 'same', n: 0 });
    expect(topPercent(214, 1940)).toBe(12);
    expect(topPercent(1, 3)).toBe(34);
  });
});

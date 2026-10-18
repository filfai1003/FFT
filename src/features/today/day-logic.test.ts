import i18n from '@/i18n';
import { formatInt } from '@/domain/numbers';
import {
  dayPart,
  daySummary,
  firstName,
  supplementsCount,
  waterGoal,
  weightLine,
  weightTrend,
} from './day-logic';

describe('greeting', () => {
  it('morning 5–11, afternoon 12–17, evening from 18 through the night', () => {
    expect(dayPart(4)).toBe('evening');
    expect(dayPart(5)).toBe('morning');
    expect(dayPart(11)).toBe('morning');
    expect(dayPart(12)).toBe('afternoon');
    expect(dayPart(17)).toBe('afternoon');
    expect(dayPart(18)).toBe('evening');
    expect(dayPart(23)).toBe('evening');
    expect(dayPart(0)).toBe('evening');
  });

  it('uses the first name only, nothing without a name', () => {
    expect(firstName('Filippo Faiella')).toBe('Filippo');
    expect(firstName('  Ana  ')).toBe('Ana');
    expect(firstName('')).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});

describe('weight change this week vs the goal', () => {
  const today = '2026-10-18';
  const down = [
    { day: '2026-10-18', weightKg: 80 },
    { day: '2026-10-11', weightKg: 80.4 },
  ];
  const up = [
    { day: '2026-10-18', weightKg: 80.4 },
    { day: '2026-10-11', weightKg: 80 },
  ];

  it('losing fat: down is toward the goal, up is not (neutral, never red)', () => {
    expect(weightTrend(down, today, 'lose_fat')).toMatchObject({
      direction: 'down',
      towardGoal: true,
    });
    expect(weightTrend(up, today, 'lose_fat')).toMatchObject({
      direction: 'up',
      towardGoal: false,
    });
  });

  it('building muscle: up is toward the goal', () => {
    expect(weightTrend(up, today, 'build_muscle')?.towardGoal).toBe(true);
    expect(weightTrend(down, today, 'build_muscle')?.towardGoal).toBe(false);
  });

  it('maintaining: within 0.3 kg is on goal, more is not', () => {
    const small = [
      { day: '2026-10-18', weightKg: 80.2 },
      { day: '2026-10-10', weightKg: 80 },
    ];
    expect(weightTrend(small, today, 'maintain')?.towardGoal).toBe(true);
    expect(weightTrend(up, today, 'maintain')?.towardGoal).toBe(false);
  });

  it('a tiny change is flat (not toward losing or gaining)', () => {
    const flat = [
      { day: '2026-10-18', weightKg: 80.02 },
      { day: '2026-10-10', weightKg: 80 },
    ];
    expect(weightTrend(flat, today, 'lose_fat')).toMatchObject({
      direction: 'flat',
      towardGoal: false,
    });
    expect(weightTrend(flat, today, 'maintain')?.towardGoal).toBe(true);
  });

  it('needs a weigh-in at least a week before; skips days without a weight', () => {
    expect(weightTrend([{ day: '2026-10-18', weightKg: 80 }], today, 'lose_fat')).toBeNull();
    expect(
      weightTrend(
        [
          { day: '2026-10-18', weightKg: 80 },
          { day: '2026-10-15', weightKg: 79 },
        ],
        today,
        'lose_fat',
      ),
    ).toBeNull();
    const trend = weightTrend(
      [
        { day: '2026-10-18', weightKg: null },
        { day: '2026-10-17', weightKg: 80 },
        { day: '2026-10-10', weightKg: 81 },
      ],
      today,
      'lose_fat',
    );
    expect(trend?.change).toBeCloseTo(-1);
  });

  it('the line covers the last four weeks, oldest first', () => {
    const line = weightLine(
      [
        { day: '2026-10-18', weightKg: 80 },
        { day: '2026-10-01', weightKg: 81 },
        { day: '2026-09-21', weightKg: 82 },
        { day: '2026-09-20', weightKg: 83 },
      ],
      today,
    );
    expect(line).toEqual([82, 81, 80]);
  });
});

describe('supplements count', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('counts the ticked ones still on the list', () => {
    expect(supplementsCount(list, new Set(['a', 'gone']))).toEqual({ taken: 1, total: 3 });
    expect(supplementsCount(list, undefined)).toEqual({ taken: 0, total: 3 });
    expect(supplementsCount([], new Set(['a']))).toEqual({ taken: 0, total: 0 });
  });
});

describe('water goal', () => {
  it('about 2 litres in whole glasses', () => {
    expect(waterGoal(250)).toEqual({ glasses: 8, ml: 2000 });
    expect(waterGoal(330)).toEqual({ glasses: 6, ml: 1980 });
  });
});

describe('summary line', () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    i18n.t(key as 'today.summaryWorkout', params as { name: string });

  it('workout up next and calories left', () => {
    expect(
      daySummary(t, formatInt, {
        workout: { kind: 'next', name: 'Workout B' },
        eatenKcal: 750,
        targetKcal: 2400,
      }),
    ).toBe('Workout B today · 1,650 kcal left');
  });

  it('workout done, calories over', () => {
    expect(
      daySummary(t, formatInt, { workout: { kind: 'done' }, eatenKcal: 2600, targetKcal: 2400 }),
    ).toBe('Workout done · 200 kcal over');
  });

  it('no target: what was eaten; nothing to say: null', () => {
    expect(
      daySummary(t, formatInt, { workout: { kind: 'none' }, eatenKcal: 500, targetKcal: null }),
    ).toBe('500 kcal eaten');
    expect(
      daySummary(t, formatInt, { workout: { kind: 'none' }, eatenKcal: 0, targetKcal: null }),
    ).toBeNull();
  });
});

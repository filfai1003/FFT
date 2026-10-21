import { calorieStatus, macroLeft, macroShares } from './summary';
import { stripStatuses } from './week-status';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));

describe('diet summary logic (DECISIONS 112)', () => {
  it('splits the calories eaten by macro (4 / 4 / 9 kcal per gram)', () => {
    const s = macroShares({ protein: 25, carbs: 25, fat: 0 });
    expect(s.map((x) => x.share)).toEqual([0.5, 0.5, 0]);
    expect(macroShares({ protein: 0, carbs: 0, fat: 0 })).toEqual([]);
  });

  it('calories left, or over; red only past 10% over', () => {
    expect(calorieStatus(850, 2000)).toEqual({
      fill: 0.425,
      amount: 1150,
      over: false,
      wellOver: false,
    });
    expect(calorieStatus(2100, 2000)).toMatchObject({ fill: 1, amount: 100, over: true });
    expect(calorieStatus(2100, 2000).wellOver).toBe(false);
    expect(calorieStatus(2300, 2000).wellOver).toBe(true);
    expect(calorieStatus(0, 2000)).toMatchObject({ fill: 0, amount: 2000, over: false });
  });

  it('left = target - eaten as shown: 90.5 kcal ("91 of 2,000") is 1,909 left everywhere', () => {
    expect(calorieStatus(90.5, 2000)).toMatchObject({ amount: 1909, over: false });
    expect(calorieStatus(2000.4, 2000)).toMatchObject({ amount: 0, over: false });
    expect(calorieStatus(2000.5, 2000)).toMatchObject({ amount: 1, over: true });
  });

  it('grams left of a macro, or over', () => {
    expect(macroLeft(40, 150)).toEqual({ grams: 110, over: false });
    expect(macroLeft(160, 150)).toEqual({ grams: 10, over: true });
  });
});

describe('day strip statuses', () => {
  const goal = {
    validFrom: '2026-01-01',
    kcal: 2000,
    proteinG: 150,
    carbsG: 200,
    fatG: 60,
    trainingDayBonusKcal: 0,
    waterMl: 2000,
  };
  const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
  const kcal = new Map([
    ['2026-10-12', 1950],
    ['2026-10-13', 2600],
    ['2026-10-15', 800],
  ]);

  it('on / off target for past days, "logged" for today, nothing for the future', () => {
    expect(stripStatuses(days, '2026-10-15', kcal, [goal], new Set())).toEqual({
      '2026-10-12': 'onTarget',
      '2026-10-13': 'off',
      '2026-10-14': 'none',
      '2026-10-15': 'logged',
      '2026-10-16': 'future',
    });
  });

  it('without a target a logged day is just "logged" (DECISIONS 104)', () => {
    const none = { ...goal, kcal: null, proteinG: null, carbsG: null, fatG: null };
    expect(stripStatuses(days, '2026-10-16', kcal, [none], new Set())['2026-10-13']).toBe('logged');
  });
});

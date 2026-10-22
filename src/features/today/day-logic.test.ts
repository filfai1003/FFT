import i18n from '@/i18n';
import { formatInt } from '@/domain/numbers';
import { dayPart, daySummary, firstName, supplementsCount, waterGoal } from './day-logic';

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
    expect(firstName('filippo')).toBe('Filippo');
    expect(firstName('')).toBeNull();
    expect(firstName(null)).toBeNull();
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
  it('the day’s target in whole glasses (2 litres until it is read)', () => {
    expect(waterGoal(250)).toEqual({ glasses: 8, ml: 2000 });
    expect(waterGoal(330)).toEqual({ glasses: 6, ml: 2000 });
    expect(waterGoal(250, 2950)).toEqual({ glasses: 12, ml: 2950 });
    expect(waterGoal(500, 200)).toEqual({ glasses: 1, ml: 200 });
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

  it('calories left from the rounded eaten value, as the cards show it', () => {
    expect(
      daySummary(t, formatInt, { workout: { kind: 'none' }, eatenKcal: 90.5, targetKcal: 2000 }),
    ).toBe('1,909 kcal left');
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

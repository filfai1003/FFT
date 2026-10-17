import { widgetSnapshot } from '@/test/widget-snapshot';
import { forToday } from './snapshot';

const yesterday = widgetSnapshot({
  day: '2026-10-15',
  workout: { kind: 'done', name: 'Push', exercises: 0, dayId: null, active: null },
});

describe('widget snapshot', () => {
  it('a snapshot of today is shown as it is', () => {
    expect(forToday(yesterday, '2026-10-15')).toBe(yesterday);
  });

  it('a new day starts from zero but keeps targets, weight and the supplement list', () => {
    const s = forToday(yesterday, '2026-10-16')!;
    expect(s.day).toBe('2026-10-16');
    expect(s.calories.eaten).toBe(0);
    expect(s.calories.target).toBe(2400);
    expect(s.calories.macros.every((m) => m.eaten === 0)).toBe(true);
    expect(s.water.ml).toBe(0);
    expect(s.workout.kind).toBe('none');
    expect(s.weight.kg).toBe(80.2);
    expect(s.supplements.map((x) => x.taken)).toEqual([false, false]);
    // Yesterday's meal is not known from the old snapshot: no "same as yesterday" offer.
    expect(s.diet.yesterdayCount).toBe(0);
  });

  it('nothing saved yet: nothing to show', () => {
    expect(forToday(null, '2026-10-16')).toBeNull();
  });
});

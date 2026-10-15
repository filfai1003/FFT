import { forToday, type WidgetSnapshot } from './snapshot';

const yesterday: WidgetSnapshot = {
  day: '2026-10-15',
  calories: {
    eaten: 1800,
    target: 2300,
    macros: [
      { key: 'protein', eaten: 120, target: 160 },
      { key: 'carbs', eaten: 200, target: 260 },
      { key: 'fat', eaten: 60, target: 70 },
    ],
  },
  water: { ml: 1500, glassMl: 250, goalGlasses: 8 },
  workout: { kind: 'done', name: 'Push', exercises: 0 },
  weight: { kg: 80.2, change7: -0.4, day: '2026-10-15' },
  supplements: [{ name: 'Creatine', taken: true }],
};

describe('widget snapshot', () => {
  it('a snapshot of today is shown as it is', () => {
    expect(forToday(yesterday, '2026-10-15')).toBe(yesterday);
  });

  it('a new day starts from zero but keeps targets, weight and the supplement list', () => {
    const s = forToday(yesterday, '2026-10-16')!;
    expect(s.day).toBe('2026-10-16');
    expect(s.calories.eaten).toBe(0);
    expect(s.calories.target).toBe(2300);
    expect(s.calories.macros.every((m) => m.eaten === 0)).toBe(true);
    expect(s.water.ml).toBe(0);
    expect(s.workout.kind).toBe('none');
    expect(s.weight.kg).toBe(80.2);
    expect(s.supplements).toEqual([{ name: 'Creatine', taken: false }]);
  });

  it('nothing saved yet: nothing to show', () => {
    expect(forToday(null, '2026-10-16')).toBeNull();
  });
});

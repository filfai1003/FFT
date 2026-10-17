import type { WidgetSnapshot } from '@/features/widgets/snapshot';

/** A full widget snapshot for tests; `patch` changes parts of it. */
export function widgetSnapshot(patch: Partial<WidgetSnapshot> = {}): WidgetSnapshot {
  return {
    v: 2,
    userId: '11111111-2222-4333-8444-555555555555',
    day: '2026-10-16',
    timeZone: 'UTC',
    weightUnit: 'kg',
    look: { accent: 'red', highContrast: false, textScaleStep: 3, bold: false },
    restAlerts: true,
    token: 'secret',
    calories: {
      eaten: 1200,
      target: 2400,
      macros: [
        { key: 'protein', eaten: 90, target: 160 },
        { key: 'carbs', eaten: 120, target: 280 },
        { key: 'fat', eaten: 40, target: 75 },
      ],
    },
    diet: {
      mode: 'tracking',
      nextMeal: null,
      mealsDone: 0,
      mealsTotal: 0,
      meal: 'lunch',
      mealEmpty: true,
      yesterdayCount: 2,
    },
    water: { ml: 750, glassMl: 250, goalGlasses: 8 },
    workout: { kind: 'next', name: 'Push A', exercises: 6, dayId: 'day-1', active: null },
    weight: { kg: 80.2, change7: -0.4, day: '2026-10-16' },
    supplements: [
      { id: 's1', name: 'Creatine', taken: true },
      { id: 's2', name: 'Vitamin D', taken: false },
    ],
    ...patch,
  };
}

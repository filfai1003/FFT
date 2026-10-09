import {
  checkAsPlanned,
  eatenFromChecks,
  goalForDay,
  kcalLeft,
  mealForHour,
  mealForPosition,
  mealsDone,
  nextFixedMeal,
  portionOptions,
  scaleNutrition,
  shareOfGoal,
  sumMacros,
  targetForDay,
  type Goal,
} from './diet';

const chicken = { kcal: 110, protein: 23, carbs: 0, fat: 1.5 };

describe('portions', () => {
  it('scales per-100 g values like the search mockup: 150 g of chicken = 165 kcal', () => {
    expect(scaleNutrition(chicken, 150)).toEqual({ kcal: 165, protein: 34.5, carbs: 0, fat: 2.3 });
  });

  it('rounds to one decimal and sums without float noise', () => {
    const a = scaleNutrition({ kcal: 33, protein: 3.3, carbs: 1.1, fat: 0.1 }, 100);
    expect(sumMacros([a, a, a])).toEqual({ kcal: 99, protein: 9.9, carbs: 3.3, fat: 0.3 });
  });

  it('the day of the log mockup adds up to 990 kcal', () => {
    const entries = [145, 275, 350, 220].map((kcal) => ({ kcal, protein: 0, carbs: 0, fat: 0 }));
    expect(sumMacros(entries).kcal).toBe(990);
    expect(kcalLeft(2350, 990)).toBe(1360);
  });

  it('over the goal shows 0 left, not a negative number', () => {
    expect(kcalLeft(2000, 2500)).toBe(0);
  });

  it('portion options: 100 g first, named portions after, no duplicate 100 g', () => {
    expect(
      portionOptions([
        { label: '1 pot · 170 g', grams: 170 },
        { label: '100 g', grams: 100 },
      ]),
    ).toEqual([
      { label: '100 g', grams: 100 },
      { label: '1 pot · 170 g', grams: 170 },
    ]);
    expect(shareOfGoal(18.7, 160)).toBe(12);
    expect(shareOfGoal(5, 0)).toBe(0);
  });
});

describe('meals', () => {
  it('maps positions and hours', () => {
    expect(mealForPosition(0)).toBe('breakfast');
    expect(mealForPosition(3)).toBe('dinner');
    expect(mealForPosition(9)).toBe('dinner');
    expect(mealForHour(8)).toBe('breakfast');
    expect(mealForHour(13)).toBe('lunch');
    expect(mealForHour(17)).toBe('snack');
    expect(mealForHour(21)).toBe('dinner');
  });
});

describe('goals', () => {
  const goal = (validFrom: string, kcal: number): Goal => ({
    validFrom,
    kcal,
    proteinG: 160,
    carbsG: 260,
    fatG: 75,
    trainingDayBonusKcal: 200,
    waterMl: 2000,
  });

  it('picks the goal in force on that day', () => {
    const goals = [goal('2026-07-16', 2600), goal('2026-09-01', 2350)];
    expect(goalForDay(goals, '2026-08-01')?.kcal).toBe(2600);
    expect(goalForDay(goals, '2026-10-08')?.kcal).toBe(2350);
    expect(goalForDay(goals, '2026-01-01')?.kcal).toBe(2600); // before any goal: the first one
    expect(goalForDay([], '2026-10-08')).toBeNull();
  });

  it('training days add the bonus calories as carbs', () => {
    expect(targetForDay(goal('x', 2350), false)).toEqual({
      kcal: 2350,
      protein: 160,
      carbs: 260,
      fat: 75,
    });
    expect(targetForDay(goal('x', 2350), true)).toEqual({
      kcal: 2550,
      protein: 160,
      carbs: 310,
      fat: 75,
    });
  });
});

describe('fixed meals', () => {
  const planned = [
    { id: 'b', kcal: 500, proteinG: 35, carbsG: 60, fatG: 12 },
    { id: 'l', kcal: 750, proteinG: 50, carbsG: 90, fatG: 18 },
    { id: 's', kcal: 300, proteinG: 25, carbsG: 30, fatG: 8 },
  ];

  it('UP NEXT is the first meal without a check', () => {
    expect(nextFixedMeal(planned, [])).toBe('b');
    expect(nextFixedMeal(planned, [{ fixedMealId: 'b' }])).toBe('l');
    expect(nextFixedMeal(planned, [{ fixedMealId: 'l' }])).toBe('b');
    expect(
      nextFixedMeal(
        planned,
        planned.map((p) => ({ fixedMealId: p.id })),
      ),
    ).toBeNull();
  });

  it('ticking copies the planned values; the total follows the mockup (2 of 4 = 1250 kcal)', () => {
    const checks = planned.slice(0, 2).map((m) => ({ fixedMealId: m.id, ...checkAsPlanned(m) }));
    expect(checks[0]).toMatchObject({ status: 'done', kcal: 500 });
    expect(eatenFromChecks(checks).kcal).toBe(1250);
    expect(mealsDone(checks)).toBe(2);
  });

  it('adjusted counts with its own values, skipped counts as handled but eats nothing', () => {
    const checks = [
      {
        fixedMealId: 'b',
        status: 'adjusted' as const,
        kcal: 900,
        proteinG: 45,
        carbsG: 110,
        fatG: 28,
      },
      { fixedMealId: 'l', status: 'skipped' as const, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    ];
    expect(eatenFromChecks(checks).kcal).toBe(900);
    expect(mealsDone(checks)).toBe(1);
    expect(nextFixedMeal(planned, checks)).toBe('s');
  });
});

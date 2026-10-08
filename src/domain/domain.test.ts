import {
  ageInYears,
  bmr,
  clampTarget,
  defaultMacros,
  macroKcal,
  macroPercents,
  macrosFromPercents,
  maintenanceKcal,
  minimumAllowedKcal,
  portion,
  setMacroPercent,
  splitDay,
  suggestedKcal,
  targetProblem,
} from './nutrition';
import { isOutOfOrder, rotationState, type PlanDay } from './rotation';
import {
  actualMax,
  bestEstimated1RM,
  detectRecords,
  epley1RM,
  percentChange,
  weightedStrengthScore,
} from './strength';
import {
  cmToFeetInches,
  displayWeight,
  feetInchesToCm,
  kcalToKj,
  kgToLb,
  lbToKg,
  loadStep,
  storedWeight,
} from './units';

describe('Epley and records', () => {
  it('epley1RM: reps 1..12 only, 1 rep is the weight', () => {
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(22, 9)).toBeCloseTo(28.6, 5);
    expect(epley1RM(100, 12)).toBeCloseTo(140, 5);
    expect(epley1RM(100, 13)).toBeNull();
    expect(epley1RM(100, 0)).toBeNull();
    expect(epley1RM(0, 5)).toBeNull();
    expect(epley1RM(100, 2.5)).toBeNull();
  });

  const sets = [
    { weightKg: 24, reps: 10, completed: true },
    { weightKg: 26, reps: 10, completed: true },
    { weightKg: 40, reps: 8, completed: false }, // not checked off: ignored
  ];

  it('actual max is the heaviest completed weight', () => {
    expect(actualMax(sets)).toBe(26);
    expect(actualMax([{ weightKg: 40, reps: 8, completed: false }])).toBeNull();
  });

  it('best estimated 1RM ignores sets over 12 reps and uncompleted sets', () => {
    expect(bestEstimated1RM(sets)).toBeCloseTo(26 * (1 + 10 / 30), 5);
    expect(bestEstimated1RM([{ weightKg: 20, reps: 20, completed: true }])).toBeNull();
  });

  it('detects NEW MAX and NEW EST. 1RM, but nothing on the first time', () => {
    const records = detectRecords({ actualMax: 24, est1rm: 32 }, sets);
    expect(records.map((r) => r.kind)).toEqual(['max', 'est1rm']);
    expect(records[0]).toMatchObject({ value: 26, was: 24 });
    expect(detectRecords({ actualMax: 30, est1rm: 40 }, sets)).toEqual([]);
    expect(detectRecords({ actualMax: null, est1rm: null }, sets)).toEqual([]);
  });

  it('a heavier weight on few reps can be a new max without a new estimated 1RM', () => {
    const records = detectRecords({ actualMax: 100, est1rm: 140 }, [
      { weightKg: 105, reps: 1, completed: true },
    ]);
    expect(records.map((r) => r.kind)).toEqual(['max']);
  });

  it('strength score is weighted by sets', () => {
    expect(percentChange(100, 110)).toBe(10);
    expect(
      weightedStrengthScore([
        { pctChange: 10, sets: 3 },
        { pctChange: 30, sets: 2 },
      ]),
    ).toBe(18);
    expect(weightedStrengthScore([])).toBeNull();
  });
});

describe('calories and macros', () => {
  it('Mifflin-St Jeor', () => {
    expect(bmr({ sex: 'male', weightKg: 78.4, heightCm: 180, ageYears: 31 })).toBeCloseTo(1759, 5);
    expect(bmr({ sex: 'female', weightKg: 60, heightCm: 165, ageYears: 30 })).toBeCloseTo(
      1320.25,
      5,
    );
  });

  it('maintenance = BMR x activity factor, rounded to 10', () => {
    const p = { sex: 'male', weightKg: 78.4, heightCm: 180, ageYears: 31 } as const;
    expect(maintenanceKcal({ ...p, activity: 'sedentary' })).toBe(2110);
    expect(maintenanceKcal({ ...p, activity: 'light' })).toBe(2420);
  });

  it('age from birth date, before and after the birthday', () => {
    const today = new Date(2026, 9, 8);
    expect(ageInYears(new Date(1995, 9, 8), today)).toBe(31);
    expect(ageInYears(new Date(1995, 9, 9), today)).toBe(30);
    expect(ageInYears(new Date(1995, 0, 1), today)).toBe(31);
  });

  it('suggested target matches the mockup: 2600 maintenance -10% = 2350', () => {
    expect(suggestedKcal(2600, 'lose_fat')).toBe(2350);
    expect(suggestedKcal(2600, 'maintain')).toBe(2600);
    expect(suggestedKcal(2600, 'build_muscle')).toBe(2850);
  });

  it('safety: nothing below 1500 kcal or with a deficit over 25%', () => {
    expect(targetProblem(1400, 1500)).toBe('below_minimum');
    expect(targetProblem(1900, 2600)).toBe('deficit_too_large');
    expect(targetProblem(1950, 2600)).toBeNull();
    expect(targetProblem(2350, 2600)).toBeNull();
    expect(minimumAllowedKcal(2600)).toBe(1950);
    expect(minimumAllowedKcal(1800)).toBe(1500);
  });

  it('a suggestion is never below the safety floor', () => {
    expect(suggestedKcal(1600, 'lose_fat')).toBe(1500);
    expect(clampTarget(1200, 1600)).toBe(1500);
    expect(clampTarget(2000, 2600)).toBe(2000);
  });

  it('macro split of the mockup: 160 P, 260 C, 75 F = 27 / 44 / 29 %', () => {
    const m = { proteinG: 160, carbsG: 260, fatG: 75 };
    expect(macroKcal(m)).toBe(2355);
    expect(macroPercents(m)).toEqual({ protein: 27, carbs: 44, fat: 29 });
  });

  it('default macros add up to the target and respect the protein cap', () => {
    const m = defaultMacros(2350, 80);
    expect(m.proteinG).toBe(160);
    expect(Math.abs(macroKcal(m) - 2350)).toBeLessThan(10);
    const small = defaultMacros(1500, 120);
    expect(small.proteinG).toBeLessThanOrEqual(Math.round((1500 * 0.35) / 4));
  });

  it('changing one macro percentage rescales the others to keep 100%', () => {
    const next = setMacroPercent({ protein: 27, carbs: 44, fat: 29 }, 'protein', 40);
    expect(next.protein).toBe(40);
    expect(next.protein + next.carbs + next.fat).toBe(100);
    expect(next.carbs).toBeGreaterThan(next.fat);
    expect(setMacroPercent({ protein: 100, carbs: 0, fat: 0 }, 'protein', 50)).toEqual({
      protein: 50,
      carbs: 25,
      fat: 25,
    });
    expect(setMacroPercent({ protein: 30, carbs: 40, fat: 30 }, 'fat', 150).fat).toBe(100);
  });

  it('grams follow from calories and percentages', () => {
    expect(macrosFromPercents(2000, { protein: 30, carbs: 40, fat: 30 })).toEqual({
      proteinG: 150,
      carbsG: 200,
      fatG: 67,
    });
  });

  it('splitDay: equal base meals, bigger main meals, carbs before and protein after the workout', () => {
    const goal = { kcal: 2400, proteinG: 180, carbsG: 250, fatG: 76 };
    const plain = { isMain: false, workout: null } as const;
    const flat = splitDay(goal, [plain, plain, plain, plain]);
    expect(
      Math.max(...flat.map((m) => m.kcal)) - Math.min(...flat.map((m) => m.kcal)),
    ).toBeLessThan(15);

    const day = splitDay(goal, [
      { isMain: false, workout: null },
      { isMain: true, workout: 'pre' },
      { isMain: false, workout: 'post' },
      { isMain: true, workout: null },
    ]);
    const [breakfast, pre, post, dinner] = day;
    expect(dinner.kcal).toBeGreaterThan(breakfast.kcal);
    expect(pre.carbsG / pre.kcal).toBeGreaterThan(dinner.carbsG / dinner.kcal);
    expect(post.proteinG / post.kcal).toBeGreaterThan(breakfast.proteinG / breakfast.kcal);
    const sum = (k: 'proteinG' | 'carbsG' | 'fatG') => day.reduce((a, m) => a + m[k], 0);
    expect(sum('proteinG')).toBe(180);
    expect(sum('carbsG')).toBe(250);
    expect(sum('fatG')).toBe(76);
    expect(Math.abs(day.reduce((a, m) => a + m.kcal, 0) - 2400)).toBeLessThan(40);
  });

  it('portion values come from per-100 g values', () => {
    expect(portion(110, 150)).toBe(165);
    expect(portion(23, 150)).toBe(34.5);
  });
});

describe('units', () => {
  it('kg <-> lb', () => {
    expect(kgToLb(100)).toBeCloseTo(220.46, 2);
    expect(lbToKg(220.462)).toBeCloseTo(100, 2);
    expect(displayWeight(100, 'lb')).toBe(220.5);
    expect(displayWeight(78.4, 'kg')).toBe(78.4);
    expect(storedWeight(185, 'lb')).toBe(83.91);
  });

  it('cm <-> ft/in', () => {
    expect(cmToFeetInches(180)).toEqual({ feet: 5, inches: 11 });
    expect(feetInchesToCm(5, 11)).toBe(180.3);
  });

  it('kcal -> kJ and the load step per unit', () => {
    expect(kcalToKj(2350)).toBeCloseTo(9832.4, 1);
    expect(loadStep('kg')).toBe(2.5);
    expect(loadStep('lb')).toBe(5);
  });
});

describe('rotation', () => {
  const days: PlanDay[] = [
    { id: 'pull', position: 0 },
    { id: 'push', position: 1 },
    { id: 'legs', position: 2 },
    { id: 'upper', position: 3 },
  ];

  it('starts at cycle 1 with the first day up next', () => {
    const s = rotationState(days, []);
    expect(s).toMatchObject({ cycle: 1, upNextDayId: 'pull', doneCount: 0, totalDays: 4 });
  });

  it('the example from the spec: Pull then Legs done, Push is still up next (cycle 3, 2/4)', () => {
    const s = rotationState(days, [
      { planDayId: 'pull', cycleNumber: 3 },
      { planDayId: 'legs', cycleNumber: 3 },
      { planDayId: 'upper', cycleNumber: 2 },
    ]);
    expect(s.cycle).toBe(3);
    expect(s.doneCount).toBe(2);
    expect(s.upNextDayId).toBe('push');
    expect(isOutOfOrder(s, 'push')).toBe(false);
    expect(isOutOfOrder(s, 'upper')).toBe(true);
  });

  it('when every day is done a new cycle starts', () => {
    const s = rotationState(
      days,
      days.map((d) => ({ planDayId: d.id, cycleNumber: 3 })),
    );
    expect(s).toMatchObject({ cycle: 4, upNextDayId: 'pull', doneCount: 0 });
  });

  it('ignores empty workouts and days that no longer belong to the plan', () => {
    const s = rotationState(days, [
      { planDayId: null, cycleNumber: null },
      { planDayId: 'deleted-day', cycleNumber: 1 },
    ]);
    expect(s).toMatchObject({ cycle: 1, doneCount: 0, upNextDayId: 'pull' });
  });

  it('doing the same day twice in a cycle counts once', () => {
    const s = rotationState(days, [
      { planDayId: 'pull', cycleNumber: 1 },
      { planDayId: 'pull', cycleNumber: 1 },
    ]);
    expect(s.doneCount).toBe(1);
    expect(s.upNextDayId).toBe('push');
  });

  it('a plan without days has nothing up next', () => {
    expect(rotationState([], []).upNextDayId).toBeNull();
  });
});

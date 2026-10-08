/** Nutrition of one portion: calories and macros (grams), plus optional label details. */
export type Per100 = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugars?: number | null;
  saturates?: number | null;
  fiber?: number | null;
  salt?: number | null;
};

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Values of `grams` of a food given per 100 g, one decimal. Logged entries COPY these values. */
export function scaleNutrition(per100: Per100, grams: number): Macros {
  const k = grams / 100;
  return {
    kcal: r1(per100.kcal * k),
    protein: r1(per100.protein * k),
    carbs: r1(per100.carbs * k),
    fat: r1(per100.fat * k),
  };
}

export function sumMacros(entries: readonly Macros[]): Macros {
  return entries.reduce(
    (a, e) => ({
      kcal: r1(a.kcal + e.kcal),
      protein: r1(a.protein + e.protein),
      carbs: r1(a.carbs + e.carbs),
      fat: r1(a.fat + e.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export const meals = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
export type Meal = (typeof meals)[number];

/** Fixed meals are free-form; foods logged "instead" go to the meal of the same position. */
export function mealForPosition(position: number): Meal {
  return meals[Math.min(Math.max(position, 0), meals.length - 1)];
}

/** Default meal for a quick add, from the time of day. */
export function mealForHour(hour: number): Meal {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 18) return 'snack';
  return 'dinner';
}

export type Goal = {
  validFrom: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  trainingDayBonusKcal: number;
  waterMl: number;
};

/** The goal in force on `day`: the latest one that started on or before it (else the first). */
export function goalForDay<T extends { validFrom: string }>(
  goals: readonly T[],
  day: string,
): T | null {
  if (goals.length === 0) return null;
  const sorted = [...goals].sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  return sorted.find((g) => g.validFrom <= day) ?? sorted[sorted.length - 1];
}

/**
 * Target of a day: with "Higher target on training days" the bonus calories are added (as carbs)
 * when a workout was logged that day.
 */
export function targetForDay(goal: Goal, trained: boolean): Macros {
  const bonus = trained ? goal.trainingDayBonusKcal : 0;
  return {
    kcal: goal.kcal + bonus,
    protein: goal.proteinG,
    carbs: goal.carbsG + Math.round(bonus / 4),
    fat: goal.fatG,
  };
}

/** Calories left today (never shown negative: over the goal is "0 left"). */
export function kcalLeft(target: number, eaten: number): number {
  return Math.max(0, Math.round(target - eaten));
}

// --- recipes ---------------------------------------------------------------------------------

export type Ingredient = { per100: Per100; grams: number };

/** Total of a whole recipe and what one serving gives. */
export function recipeNutrition(items: readonly Ingredient[], servings: number) {
  const total = sumMacros(items.map((i) => scaleNutrition(i.per100, i.grams)));
  const s = Math.max(servings, 0.01);
  return {
    total,
    perServing: {
      kcal: Math.round(total.kcal / s),
      protein: Math.round(total.protein / s),
      carbs: Math.round(total.carbs / s),
      fat: Math.round(total.fat / s),
    },
  };
}

// --- fixed meals -----------------------------------------------------------------------------

export type FixedMealPlanned = {
  id: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};
export type FixedCheck = {
  fixedMealId: string;
  status: 'done' | 'adjusted' | 'skipped';
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/** The first planned meal not yet checked (done, adjusted or skipped) is "UP NEXT". */
export function nextFixedMeal(
  meals: readonly { id: string }[],
  checks: readonly { fixedMealId: string }[],
): string | null {
  const checked = new Set(checks.map((c) => c.fixedMealId));
  return meals.find((m) => !checked.has(m.id))?.id ?? null;
}

/** A tick on a fixed meal copies the planned values into the day's check. */
export function checkAsPlanned(m: FixedMealPlanned): Omit<FixedCheck, 'fixedMealId'> {
  return { status: 'done', kcal: m.kcal, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG };
}

export function eatenFromChecks(checks: readonly FixedCheck[]): Macros {
  return sumMacros(
    checks
      .filter((c) => c.status !== 'skipped')
      .map((c) => ({ kcal: c.kcal, protein: c.proteinG, carbs: c.carbsG, fat: c.fatG })),
  );
}

/** How many meals count as handled (done or adjusted) for "MEALS 2/4". */
export function mealsDone(checks: readonly FixedCheck[]): number {
  return checks.filter((c) => c.status === 'done' || c.status === 'adjusted').length;
}

// --- grams and portions ----------------------------------------------------------------------

export type Portion = { label: string; grams: number };

/** Chips under AMOUNT: 100 g, the named portions of the food, then custom. */
export function portionOptions(servings: readonly Portion[]): Portion[] {
  const options: Portion[] = [{ label: '100 g', grams: 100 }];
  for (const s of servings) if (s.grams !== 100) options.push(s);
  return options;
}

/** "of goal" share for the macro cards (whole percent). */
export function shareOfGoal(grams: number, goalGrams: number): number {
  if (goalGrams <= 0) return 0;
  return Math.round((grams / goalGrams) * 100);
}

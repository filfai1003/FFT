export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'active' | 'physical';
export type Goal = 'lose_fat' | 'maintain' | 'build_muscle';

/** Safety limits (also enforced in the database and for any future AI plan). */
export const MIN_DAILY_KCAL = 1500;
export const MAX_DEFICIT = 0.25;

export const kcalPerGram = { protein: 4, carbs: 4, fat: 9 } as const;

/** Multipliers for the four "daily activity outside training" choices of Personal info. */
export const activityFactor: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  active: 1.55,
  physical: 1.725,
};

export function ageInYears(birthDate: Date, today: Date): number {
  let age = today.getFullYear() - birthDate.getFullYear();
  const hadBirthday =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

/** Basal metabolic rate, Mifflin-St Jeor (kcal/day). */
export function bmr(p: { sex: Sex; weightKg: number; heightCm: number; ageYears: number }): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears;
  return base + (p.sex === 'male' ? 5 : -161);
}

/** Maintenance calories: BMR × activity factor, rounded to 10. */
export function maintenanceKcal(p: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
  activity: ActivityLevel;
}): number {
  return Math.round((bmr(p) * activityFactor[p.activity]) / 10) * 10;
}

const goalAdjustment: Record<Goal, number> = { lose_fat: -0.1, maintain: 0, build_muscle: 0.1 };

/** Suggested daily target for a goal (maintenance −10% / 0 / +10%), rounded to 50 kcal. */
export function suggestedKcal(maintenance: number, goal: Goal): number {
  const raw = maintenance * (1 + goalAdjustment[goal]);
  return clampTarget(Math.round(raw / 50) * 50, maintenance);
}

export type TargetProblem = 'below_minimum' | 'deficit_too_large';

/** Which safety rule a target breaks, or null when it is allowed. */
export function targetProblem(kcal: number, maintenance: number): TargetProblem | null {
  if (kcal < MIN_DAILY_KCAL) return 'below_minimum';
  if (kcal < maintenance * (1 - MAX_DEFICIT)) return 'deficit_too_large';
  return null;
}

/** Lowest allowed target for this maintenance (the −/+ stepper stops here). */
export function minimumAllowedKcal(maintenance: number): number {
  return Math.max(MIN_DAILY_KCAL, Math.ceil((maintenance * (1 - MAX_DEFICIT)) / 50) * 50);
}

export function clampTarget(kcal: number, maintenance: number): number {
  return Math.max(kcal, minimumAllowedKcal(maintenance));
}

export function macroKcal(m: { proteinG: number; carbsG: number; fatG: number }): number {
  return m.proteinG * kcalPerGram.protein + m.carbsG * kcalPerGram.carbs + m.fatG * kcalPerGram.fat;
}

/**
 * Starting macro split for a calorie target: 2 g protein per kg (at most 35% of the calories),
 * ~28% of the calories from fat, the rest carbs.
 */
export function defaultMacros(kcal: number, weightKg: number) {
  const proteinG = Math.round(Math.min(2 * weightKg, (kcal * 0.35) / kcalPerGram.protein));
  const fatG = Math.round((kcal * 0.28) / kcalPerGram.fat);
  const carbsG = Math.max(
    0,
    Math.round(
      (kcal - proteinG * kcalPerGram.protein - fatG * kcalPerGram.fat) / kcalPerGram.carbs,
    ),
  );
  return { proteinG, carbsG, fatG };
}

/** Share of calories from each macro, whole percentages that add up to 100. */
export function macroPercents(m: { proteinG: number; carbsG: number; fatG: number }) {
  const total = macroKcal(m);
  if (total === 0) return { protein: 0, carbs: 0, fat: 0 };
  const protein = Math.round(((m.proteinG * kcalPerGram.protein) / total) * 100);
  const fat = Math.round(((m.fatG * kcalPerGram.fat) / total) * 100);
  return { protein, carbs: 100 - protein - fat, fat };
}

type Percents = { protein: number; carbs: number; fat: number };

/**
 * Sets one macro's share of the calories and rescales the other two proportionally so the
 * three whole percentages keep adding up to 100.
 */
export function setMacroPercent(current: Percents, key: keyof Percents, value: number): Percents {
  const next = Math.min(100, Math.max(0, Math.round(value)));
  const [a, b] = (['protein', 'carbs', 'fat'] as const).filter((k) => k !== key);
  const rest = 100 - next;
  const others = current[a] + current[b];
  const aShare = others === 0 ? Math.round(rest / 2) : Math.round((current[a] / others) * rest);
  return { ...current, [key]: next, [a]: aShare, [b]: rest - aShare };
}

/** Grams of each macro for a calorie target and a percentage split. */
export function macrosFromPercents(kcal: number, p: Percents) {
  return {
    proteinG: Math.round((kcal * p.protein) / 100 / kcalPerGram.protein),
    carbsG: Math.round((kcal * p.carbs) / 100 / kcalPerGram.carbs),
    fatG: Math.round((kcal * p.fat) / 100 / kcalPerGram.fat),
  };
}

/** Values of a portion of food from its per-100 g values. */
export function portion(per100g: number, grams: number): number {
  return Math.round(((per100g * grams) / 100) * 10) / 10;
}

export type MealShare = { name: string; share: number };

/** Default meals of the fixed-meals mode and how the daily target is split between them. */
export const defaultMealShares = [
  { name: 'Breakfast', share: 0.25 },
  { name: 'Lunch', share: 0.3 },
  { name: 'Snack', share: 0.15 },
  { name: 'Dinner', share: 0.3 },
] as const satisfies readonly MealShare[];

export type Totals = { kcal: number; proteinG: number; carbsG: number; fatG: number };

/**
 * "Auto-split": divides a daily target between meals by share. Values are whole numbers and the
 * meals always add up exactly to the target (the rounding remainder goes to the biggest meal).
 */
export function autoSplit(total: Totals, shares: readonly number[]): Totals[] {
  const sum = shares.reduce((a, b) => a + b, 0);
  const keys = ['kcal', 'proteinG', 'carbsG', 'fatG'] as const;
  const result: Totals[] = shares.map((s) => {
    const r = {} as Totals;
    for (const k of keys) r[k] = Math.floor((total[k] * s) / sum);
    return r;
  });
  const biggest = shares.indexOf(Math.max(...shares));
  for (const k of keys) {
    const assigned = result.reduce((a, m) => a + m[k], 0);
    result[biggest][k] += Math.round(total[k]) - assigned;
  }
  return result;
}

/** A main meal ("bigger meal", e.g. lunch and dinner) gets this many times the base calories. */
export const MAIN_MEAL_FACTOR = 1.4;
/** Pre-workout meal: this share of its calories moves from fat to carbs. */
export const PRE_WORKOUT_CARBS_SHIFT = 0.12;
/** Post-workout meal: this share of its calories moves from fat to protein. */
export const POST_WORKOUT_PROTEIN_SHIFT = 0.08;

export type MealRole = { isMain: boolean; workout: 'pre' | 'post' | null };

/**
 * Auto-split of the day over meals, aware of the workout:
 * - every meal gets the same base calories, a main meal gets MAIN_MEAL_FACTOR times more;
 * - the meal before the workout gets more carbs, the one after it more protein (taken from fat);
 * - the other meals absorb the difference so the day still adds up to the target macros.
 * Meal calories are the calories of the meal's macros (4/4/9), as in the editor.
 */
export function splitDay(goal: Totals, roles: readonly MealRole[]): Totals[] {
  const weights = roles.map((r) => (r.isMain ? MAIN_MEAL_FACTOR : 1));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const mealKcal = weights.map((w) => (goal.kcal * w) / weightSum);

  const goalKcal = {
    protein: goal.proteinG * kcalPerGram.protein,
    carbs: goal.carbsG * kcalPerGram.carbs,
    fat: goal.fatG * kcalPerGram.fat,
  };
  const goalTotal = goalKcal.protein + goalKcal.carbs + goalKcal.fat || 1;
  const base = {
    protein: goalKcal.protein / goalTotal,
    carbs: goalKcal.carbs / goalTotal,
    fat: goalKcal.fat / goalTotal,
  };

  type Share = { protein: number; carbs: number; fat: number };
  const shares: Share[] = roles.map((r) => {
    if (r.workout === 'pre') {
      const shift = Math.min(PRE_WORKOUT_CARBS_SHIFT, Math.max(0, base.fat - 0.05));
      return { ...base, carbs: base.carbs + shift, fat: base.fat - shift };
    }
    if (r.workout === 'post') {
      const shift = Math.min(POST_WORKOUT_PROTEIN_SHIFT, Math.max(0, base.fat - 0.05));
      return { ...base, protein: base.protein + shift, fat: base.fat - shift };
    }
    return { ...base };
  });

  // The plain meals take whatever the workout meals did not cover, so the day keeps its totals.
  const plain = roles.map((r, i) => (r.workout === null ? i : -1)).filter((i) => i >= 0);
  const plainKcal = plain.reduce((a, i) => a + mealKcal[i], 0);
  if (plain.length > 0 && plainKcal > 0) {
    const keys = ['protein', 'carbs', 'fat'] as const;
    const covered = { protein: 0, carbs: 0, fat: 0 };
    roles.forEach((r, i) => {
      if (r.workout !== null) for (const k of keys) covered[k] += mealKcal[i] * shares[i][k];
    });
    const need = keys.map((k) => Math.max(0, goalKcal[k] - covered[k]));
    const needSum = need.reduce((a, b) => a + b, 0) || 1;
    const plainShare = {
      protein: need[0] / needSum,
      carbs: need[1] / needSum,
      fat: need[2] / needSum,
    };
    for (const i of plain) shares[i] = plainShare;
  }

  const grams = roles.map((_, i) => ({
    proteinG: Math.round((mealKcal[i] * shares[i].protein) / kcalPerGram.protein),
    carbsG: Math.round((mealKcal[i] * shares[i].carbs) / kcalPerGram.carbs),
    fatG: Math.round((mealKcal[i] * shares[i].fat) / kcalPerGram.fat),
  }));
  // Rounding remainder goes to the biggest plain meal (or the biggest meal) so grams add up.
  const pool = plain.length > 0 ? plain : roles.map((_, i) => i);
  const biggest = pool.reduce((best, i) => (mealKcal[i] > mealKcal[best] ? i : best), pool[0]);
  for (const k of ['proteinG', 'carbsG', 'fatG'] as const) {
    const assigned = grams.reduce((a, g) => a + g[k], 0);
    grams[biggest][k] = Math.max(0, grams[biggest][k] + Math.round(goal[k]) - assigned);
  }
  return grams.map((g) => ({ ...g, kcal: Math.round(macroKcal(g)) }));
}

/** Scales grams of each macro by a ratio (when the calorie target changes, the split stays). */
export function scaleMacros(
  m: { proteinG: number; carbsG: number; fatG: number },
  ratio: number,
): { proteinG: number; carbsG: number; fatG: number } {
  return {
    proteinG: Math.round(m.proteinG * ratio),
    carbsG: Math.round(m.carbsG * ratio),
    fatG: Math.round(m.fatG * ratio),
  };
}

/** Extra calories on training days when "Higher target on training days" is on. */
export const TRAINING_DAY_BONUS_KCAL = 200;

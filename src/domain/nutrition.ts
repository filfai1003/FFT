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

/** Values of a portion of food from its per-100 g values. */
export function portion(per100g: number, grams: number): number {
  return Math.round(((per100g * grams) / 100) * 10) / 10;
}

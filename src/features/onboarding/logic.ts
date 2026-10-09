import {
  ageInYears,
  defaultMacros,
  defaultMeals,
  macroPercents,
  macrosFromPercents,
  maintenanceKcal,
  minimumAllowedKcal,
  splitDay,
  suggestedKcal,
  type ActivityLevel,
  type Goal,
  type Sex,
  type Totals,
} from '@/domain/nutrition';

export const MIN_AGE = 18;

export type MacroSplit = { protein: number; carbs: number; fat: number };

/** A meal of the first fixed-meals plan, as edited during the onboarding. */
export type OnboardingMeal = {
  id: string;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  description: string;
  isMain: boolean;
};
export const POLICY_VERSION = 'v1-2026-10';

export type OnboardingDraft = {
  goal: Goal | null;
  name: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  sex: Sex | null;
  heightCm: string;
  weightKg: string;
  activity: ActivityLevel | null;
  experience: 'beginner' | 'intermediate' | 'advanced' | null;
  location: 'gym' | 'home' | 'bodyweight' | null;
  /** The calorie target the user settled on; null = still the suggestion. */
  targetKcal: number | null;
  /** Macro split as % of the calories; null = the suggested split. */
  macroSplit: MacroSplit | null;
  dietMode: 'tracking' | 'fixed_meals' | null;
  /** The meals the user set up; null = the suggested ones. Reset when the target changes. */
  meals: OnboardingMeal[] | null;
  /** The workout sits right after this meal (a meal id of `meals`). */
  workoutAfterId: string | null;
  consentHealth: boolean;
  consentAnalytics: boolean;
};

export const emptyDraft: OnboardingDraft = {
  goal: null,
  name: '',
  birthDay: '',
  birthMonth: '',
  birthYear: '',
  sex: null,
  heightCm: '',
  weightKg: '',
  activity: null,
  experience: null,
  location: null,
  targetKcal: null,
  macroSplit: null,
  dietMode: null,
  meals: null,
  workoutAfterId: null,
  consentHealth: false,
  consentAnalytics: false,
};

/** A real calendar date from three text fields, or null. */
export function parseBirthDate(day: string, month: string, year: string): Date | null {
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return null;
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  const date = new Date(y, m - 1, d);
  const valid = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  return valid && y >= 1900 ? date : null;
}

export function toIsoDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export type BodyProblem = 'name' | 'birth' | 'underage' | 'sex' | 'height' | 'weight';

/** Everything wrong with the "About you" step (empty array = can continue). */
export function bodyProblems(d: OnboardingDraft, today: Date): BodyProblem[] {
  const problems: BodyProblem[] = [];
  if (d.name.trim().length === 0) problems.push('name');
  const birth = parseBirthDate(d.birthDay, d.birthMonth, d.birthYear);
  if (!birth || birth > today) problems.push('birth');
  else if (ageInYears(birth, today) < MIN_AGE) problems.push('underage');
  if (!d.sex) problems.push('sex');
  const height = Number(d.heightCm.replace(',', '.'));
  if (!(height >= 100 && height <= 250)) problems.push('height');
  const weight = Number(d.weightKg.replace(',', '.'));
  if (!(weight >= 30 && weight <= 300)) problems.push('weight');
  return problems;
}

export function targetsFor(d: OnboardingDraft, today: Date) {
  const birth = parseBirthDate(d.birthDay, d.birthMonth, d.birthYear)!;
  const weightKg = Number(d.weightKg.replace(',', '.'));
  const maintenance = maintenanceKcal({
    sex: d.sex!,
    weightKg,
    heightCm: Number(d.heightCm.replace(',', '.')),
    ageYears: ageInYears(birth, today),
    activity: d.activity!,
  });
  const suggested = suggestedKcal(maintenance, d.goal!);
  const kcal = d.targetKcal ?? suggested;
  const macros = d.macroSplit
    ? macrosFromPercents(kcal, d.macroSplit)
    : defaultMacros(kcal, weightKg);
  return {
    weightKg,
    maintenance,
    suggested,
    minimum: minimumAllowedKcal(maintenance),
    kcal,
    macros,
    split: d.macroSplit ?? macroPercents(macros),
  };
}

/**
 * The 4 starter meals of the fixed-meals mode: same base calories, lunch and dinner bigger, adding
 * up to the daily target.
 */
export function starterMeals(goal: Totals): OnboardingMeal[] {
  const parts = splitDay(
    goal,
    defaultMeals.map((m) => ({ isMain: m.isMain, workout: null })),
  );
  return defaultMeals.map((m, i) => ({
    id: `starter-${i}`,
    name: m.name,
    isMain: m.isMain,
    description: '',
    ...parts[i],
  }));
}

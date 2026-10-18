import {
  ageInYears,
  clampTarget,
  DEFAULT_DAILY_KCAL,
  defaultMeals,
  macroPercents,
  macrosFromPercents,
  maintenanceFromDetails,
  minimumAllowedKcal,
  splitDay,
  startingMacros,
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
/**
 * Version of the privacy policy and consent text a consent was given for (stored with it). A new
 * version whose consent text changed materially asks people who agreed to an older one to confirm
 * once (DECISIONS 99). v2: the consent text says who can reach the data (DECISIONS 81).
 */
export const POLICY_VERSION = 'v2-2026-10-18';

export type OnboardingDraft = {
  goal: Goal | null;
  name: string;
  /** "I am 18 or older": required (legal minimum age), the birth date is optional. */
  adultConfirmed: boolean;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  sex: Sex | null;
  heightCm: string;
  weightKg: string;
  activity: ActivityLevel | null;
  experience: 'beginner' | 'intermediate' | 'advanced' | null;
  location: 'gym' | 'home' | 'bodyweight' | null;
  /**
   * A calorie target, or none (DECISIONS 104): calories are then tracked without a target. Skip
   * on the target step and "Skip setup" mean none.
   */
  target: 'set' | 'none';
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
  adultConfirmed: false,
  birthDay: '',
  birthMonth: '',
  birthYear: '',
  sex: null,
  heightCm: '',
  weightKg: '',
  activity: null,
  experience: null,
  location: null,
  target: 'set',
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

export type BodyProblem = 'name' | 'adult' | 'birth' | 'underage' | 'height' | 'weight';

/** A typed number: null when the field is empty, NaN when it is not a number. */
function typedNumber(text: string): number | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : Number(trimmed.replace(',', '.'));
}

const inRange = (v: number | null, lo: number, hi: number) => v != null && v >= lo && v <= hi;

/** Something was typed in one of the three birth date fields. */
export function birthTyped(d: OnboardingDraft): boolean {
  return d.birthDay !== '' || d.birthMonth !== '' || d.birthYear !== '';
}

/**
 * Everything wrong with the "About you" step (empty array = can continue). Only the name and the
 * "I am 18 or older" confirmation are required (DECISIONS 103); birth date, height and weight are
 * checked only when something is typed in them (a birth date given must still be 18+).
 */
export function bodyProblems(d: OnboardingDraft, today: Date): BodyProblem[] {
  const problems: BodyProblem[] = [];
  if (d.name.trim().length === 0) problems.push('name');
  if (!d.adultConfirmed) problems.push('adult');
  if (birthTyped(d)) {
    const birth = parseBirthDate(d.birthDay, d.birthMonth, d.birthYear);
    if (!birth || birth > today) problems.push('birth');
    else if (ageInYears(birth, today) < MIN_AGE) problems.push('underage');
  }
  const height = typedNumber(d.heightCm);
  if (height != null && !inRange(height, 100, 250)) problems.push('height');
  const weight = typedNumber(d.weightKg);
  if (weight != null && !inRange(weight, 30, 300)) problems.push('weight');
  return problems;
}

/** The optional body details the user gave, each null when missing or not valid. */
export function bodyDetails(d: OnboardingDraft, today: Date) {
  const parsed = parseBirthDate(d.birthDay, d.birthMonth, d.birthYear);
  const birth = parsed && parsed <= today && ageInYears(parsed, today) >= MIN_AGE ? parsed : null;
  const height = typedNumber(d.heightCm);
  const weight = typedNumber(d.weightKg);
  return {
    birth,
    ageYears: birth ? ageInYears(birth, today) : null,
    heightCm: inRange(height, 100, 250) ? height : null,
    weightKg: inRange(weight, 30, 300) ? weight : null,
  };
}

/**
 * Calorie and macro targets of the onboarding. With sex, birth date, height and weight the
 * Mifflin-St Jeor suggestion (activity "Mostly sitting" when skipped, goal "Maintain" when
 * skipped); without one of them there is no suggestion (`maintenance` and `suggested` null) and
 * the target starts at DEFAULT_DAILY_KCAL, which the user can change. The 1500 kcal floor (and the
 * 25% deficit limit when the maintenance is known) always applies.
 */
export function targetsFor(d: OnboardingDraft, today: Date) {
  const details = bodyDetails(d, today);
  const maintenance = maintenanceFromDetails({
    sex: d.sex,
    weightKg: details.weightKg,
    heightCm: details.heightCm,
    ageYears: details.ageYears,
    activity: d.activity,
  });
  const suggested = maintenance != null ? suggestedKcal(maintenance, d.goal ?? 'maintain') : null;
  const kcal = clampTarget(d.targetKcal ?? suggested ?? DEFAULT_DAILY_KCAL, maintenance);
  const macros = d.macroSplit
    ? macrosFromPercents(kcal, d.macroSplit)
    : startingMacros(kcal, details.weightKg);
  return {
    weightKg: details.weightKg,
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

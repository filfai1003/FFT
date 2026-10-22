/**
 * The daily water target (DECISIONS 127): how much to DRINK in a day, in ml. Water from food
 * (about a fifth of the total, EFSA 2010) is not counted, so the numbers are for drinks only.
 *
 * Model (the sources are in DECISIONS 127):
 * - Base: body weight × 35 ml/kg under 30, 33 ml/kg from 30 to 54, 30 ml/kg from 55 (age unknown:
 *   33). With a BMI over 30 only 40% of the weight above the BMI 30 weight counts (the "adjusted
 *   body weight" idea, measured from BMI 30 so the target never drops when the BMI crosses 30).
 * - Floor: never under the EFSA adequate intake from drinks: 2.0 L men, 1.6 L women, 1.8 L when
 *   the sex is not given.
 * - Training day: +500 ml per hour of the day's finished workouts (+500 ml when the length is not
 *   known), at most +1.5 L.
 * - Rounded to 50 ml and kept between 1.5 and 5.0 L.
 * - Missing data: no weight = the floor of the sex (2.0 L when the sex is not given either).
 *
 * Pure and shared: the app (`features/diet/water-target.ts`) and the API (server/api.js,
 * server/coach.js) both call it, so they always agree.
 */

export type WaterSex = 'male' | 'female' | null;

export type WaterInputs = {
  weightKg?: number | null;
  heightCm?: number | null;
  ageYears?: number | null;
  sex?: WaterSex;
  /** A finished workout that day. */
  trainedToday?: boolean;
  /** Total length of that day's finished workouts, when known. */
  workoutMinutes?: number | null;
};

export const WATER_MIN_ML = 1500;
export const WATER_MAX_ML = 5000;
/** The target when nothing is known (and the old fixed default, DECISIONS 127). */
export const DEFAULT_WATER_ML = 2000;
export const WATER_ML_PER_TRAINING_HOUR = 500;
export const WATER_TRAINING_MAX_ML = 1500;
/** EFSA adequate intake of water from drinks (80% of the total 2.5 L men / 2.0 L women). */
export const WATER_FLOOR_ML = { male: 2000, female: 1600, unknown: 1800 } as const;
/** Manual targets the user may set (the database allows 500–10000). */
export const WATER_MANUAL_MIN_ML = 500;
export const WATER_MANUAL_MAX_ML = 10000;

export type WaterBreakdown = {
  /** The target, rounded to 50 ml and within 1.5–5.0 L. */
  ml: number;
  /**
   * Where the base comes from: body weight (with the ml per kg and, above BMI 30, the weight
   * that counts), or, without a weight, the floor of the sex ('floor') or the default ('default').
   */
  base:
    | {
        kind: 'weight';
        weightKg: number;
        /** The weight used when the BMI is over 30 (else null: the real weight is used). */
        countedKg: number | null;
        mlPerKg: number;
        ml: number;
      }
    | { kind: 'floor' | 'default'; ml: number };
  /** The minimum for the sex, and whether it raised the base. */
  floorMl: number;
  floorApplied: boolean;
  /** Extra for training (0 when not a training day) and the minutes it was computed from. */
  trainingMl: number;
  workoutMinutes: number | null;
  /** The total was outside 1.5–5.0 L and was moved to the limit. */
  clamped: 'min' | 'max' | null;
  /** Which of the user's details were used. */
  used: { weight: boolean; height: boolean; age: boolean; sex: boolean };
};

const known = (n: number | null | undefined): n is number =>
  n != null && Number.isFinite(n) && n > 0;

/** ml per kg of body weight for an age (unknown age: the middle band). */
export function waterMlPerKg(ageYears: number | null | undefined): number {
  if (ageYears == null || !Number.isFinite(ageYears)) return 33;
  if (ageYears < 30) return 35;
  if (ageYears < 55) return 33;
  return 30;
}

/** The weight that counts: above BMI 30, only 40% of the weight over the BMI 30 weight. */
export function countedWeightKg(weightKg: number, heightCm: number | null | undefined): number {
  if (!known(heightCm)) return weightKg;
  const m = heightCm / 100;
  const bmi30 = 30 * m * m;
  return weightKg > bmi30 ? bmi30 + 0.4 * (weightKg - bmi30) : weightKg;
}

/** Extra water for a training day: 500 ml per hour (500 ml when the length is unknown), ≤ 1.5 L. */
export function trainingWaterMl(trained: boolean, minutes: number | null | undefined): number {
  if (!trained) return 0;
  const extra = known(minutes)
    ? (minutes / 60) * WATER_ML_PER_TRAINING_HOUR
    : WATER_ML_PER_TRAINING_HOUR;
  return Math.min(WATER_TRAINING_MAX_ML, Math.round(extra));
}

const round50 = (ml: number) => Math.round(ml / 50) * 50;

/** The daily water target from drinks, with how it was reached. */
export function waterTarget(input: WaterInputs): WaterBreakdown {
  const sex = input.sex === 'male' || input.sex === 'female' ? input.sex : null;
  const floorMl = WATER_FLOOR_ML[sex ?? 'unknown'];
  const weight = known(input.weightKg) ? input.weightKg : null;
  const age = input.ageYears != null && Number.isFinite(input.ageYears) ? input.ageYears : null;
  const heightUsed = weight != null && known(input.heightCm);

  let base: WaterBreakdown['base'];
  let floorApplied = false;
  let baseMl: number;
  if (weight != null) {
    const counted = countedWeightKg(weight, input.heightCm);
    const mlPerKg = waterMlPerKg(age);
    const ml = Math.round(counted * mlPerKg);
    base = {
      kind: 'weight',
      weightKg: weight,
      countedKg: counted !== weight ? Math.round(counted * 10) / 10 : null,
      mlPerKg,
      ml,
    };
    floorApplied = ml < floorMl;
    baseMl = Math.max(ml, floorMl);
  } else if (sex) {
    base = { kind: 'floor', ml: floorMl };
    baseMl = floorMl;
  } else {
    base = { kind: 'default', ml: DEFAULT_WATER_ML };
    baseMl = DEFAULT_WATER_ML;
  }

  const trainingMl = trainingWaterMl(input.trainedToday === true, input.workoutMinutes);
  const total = round50(baseMl + trainingMl);
  const ml = Math.min(WATER_MAX_ML, Math.max(WATER_MIN_ML, total));
  return {
    ml,
    base,
    floorMl,
    floorApplied,
    trainingMl,
    workoutMinutes: input.trainedToday && known(input.workoutMinutes) ? input.workoutMinutes : null,
    clamped: total < WATER_MIN_ML ? 'min' : total > WATER_MAX_ML ? 'max' : null,
    used: {
      weight: weight != null,
      height: heightUsed,
      age: weight != null && age != null,
      sex: sex != null,
    },
  };
}

/** Just the number: the daily water target from drinks, in ml. */
export function waterTargetMl(input: WaterInputs): number {
  return waterTarget(input).ml;
}

/** Age in whole years on a day, from YYYY-MM-DD strings (no time zone involved). */
export function ageOnDay(birthDate: string | null | undefined, day: string): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}/.test(birthDate)) return null;
  const [by, bm, bd] = birthDate.slice(0, 10).split('-').map(Number);
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * Minutes of the day's finished workouts: the sum of their lengths, each kept to 3 hours (a
 * workout left running overnight). A workout without an end counts as one hour. Null when none.
 */
export function workoutMinutes(
  workouts: readonly { startedAt: string; endedAt: string | null }[],
): number | null {
  if (workouts.length === 0) return null;
  let total = 0;
  for (const w of workouts) {
    const ms = w.endedAt ? Date.parse(w.endedAt) - Date.parse(w.startedAt) : NaN;
    total += Number.isFinite(ms) && ms > 0 ? Math.min(180, ms / 60000) : 60;
  }
  return Math.round(total);
}

/**
 * Whether a goal row's water target is automatic. `water_auto` null = a row written before the
 * automatic target existed: it was automatic unless the user had changed the 2000 ml default
 * (DECISIONS 127: exactly 2000 is taken as the untouched default).
 */
export function isWaterAutomatic(row: {
  water_auto?: boolean | null;
  water_ml?: number | string | null;
}): boolean {
  if (row.water_auto != null) return row.water_auto;
  return row.water_ml == null || Number(row.water_ml) === DEFAULT_WATER_ML;
}

export type EffectiveWater = {
  /** The target in force: the automatic one or the user's own. */
  ml: number;
  automatic: boolean;
  /** The automatic target and how it was reached (also when the user set their own). */
  auto: WaterBreakdown;
  /** The user's own number (kept when switching to automatic, to come back to it). */
  manualMl: number | null;
};

/**
 * The water target in force on a day: a goal row's own number when the user set one, else the
 * automatic target from their details. No goal row at all = automatic.
 */
export function effectiveWaterTarget(
  goal: { waterMl: number | null; waterAuto: boolean } | null | undefined,
  input: WaterInputs,
): EffectiveWater {
  const auto = waterTarget(input);
  const manual = goal && !goal.waterAuto && known(goal.waterMl) ? goal.waterMl : null;
  return {
    ml: manual ?? auto.ml,
    automatic: manual == null,
    auto,
    manualMl: goal?.waterMl ?? null,
  };
}

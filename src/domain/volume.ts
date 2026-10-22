import { addDays, weekOf } from './day';
import {
  INVOLVEMENT_SHARE,
  muscles,
  muscleShares,
  strengthGroup,
  type ExerciseMuscles,
  type Muscle,
  type StrengthGroup,
} from './muscles';

export type { ExerciseMuscles };

/**
 * Weekly training balance (DECISIONS 121, 125): hard sets and volume per muscle per week.
 *
 * - A **hard set** is a completed main set (drop_index 0, DECISIONS 54) of a finished workout
 *   that is not a warm-up. A warm-up is a weighted set lighter than `WARM_UP_SHARE` of the
 *   heaviest main set of the same exercise in the same workout (the app has no warm-up flag;
 *   progression already treats lighter sets as warm-ups). Sets without weight (bodyweight, reps,
 *   time) all count. A set logged with 0 reps does not.
 * - Each muscle of the exercise gets its share of the set: primary 1, secondary 0.5, indirect
 *   0.25 (`exercises.primary_muscle` / `secondary_muscles` / `indirect_muscles`).
 * - **Volume** (kg × reps) follows the volume rule of the views: every completed weighted set,
 *   drops included, shared the same way. A secondary figure.
 */

export const WARM_UP_SHARE = 0.6;
export const SECONDARY_SHARE = INVOLVEMENT_SHARE.secondary;

/**
 * Evidence-based guideline of weekly hard sets per muscle for growth: about 10 to 20.
 * A guide shown as a band, never a judgment.
 */
export const WEEKLY_SETS_GUIDE = { min: 10, max: 20 } as const;
export type SetsGuide = { min: number; max: number };

/**
 * Muscles without a guideline (DECISIONS 125): they get most of their work as helpers of the big
 * lifts (front shoulders from every press, lower back from squats and deadlifts, forearms from
 * anything held, adductors from squats and lunges, obliques from core and carries), and the
 * 10–20 sets research is about the muscles an exercise mainly trains. Their sets are shown, never
 * judged, so nobody adds isolation work just to fill a band.
 */
export const helperMuscles: readonly Muscle[] = [
  'front_delts',
  'lower_back',
  'forearms',
  'adductors',
  'obliques',
];

/** The guideline of a muscle, or null for the helper muscles. */
export function guideOf(muscle: Muscle): SetsGuide | null {
  return helperMuscles.includes(muscle) ? null : WEEKLY_SETS_GUIDE;
}

/** Every muscle in its group, in display order (the six groups of the filters). */
export const balanceMuscles: { muscle: Muscle; group: StrengthGroup }[] = muscles.map((m) => ({
  muscle: m,
  group: strengthGroup(m),
}));

export type VolumeSet = {
  sessionId: string;
  exerciseId: string;
  /** The user's local day of the workout. */
  day: string;
  dropIndex: number;
  weightKg: number | null;
  reps: number | null;
};

/** The completed sets that count as hard sets (see the rules above). */
export function hardSets(sets: readonly VolumeSet[]): VolumeSet[] {
  const heaviest = new Map<string, number>();
  for (const s of sets) {
    if (s.dropIndex !== 0 || !(s.weightKg != null && s.weightKg > 0)) continue;
    const key = `${s.sessionId}|${s.exerciseId}`;
    heaviest.set(key, Math.max(heaviest.get(key) ?? 0, s.weightKg));
  }
  return sets.filter((s) => {
    if (s.dropIndex !== 0) return false;
    if (s.reps != null && s.reps <= 0) return false;
    if (s.weightKg == null || s.weightKg <= 0) return true;
    const top = heaviest.get(`${s.sessionId}|${s.exerciseId}`) ?? 0;
    return s.weightKg >= top * WARM_UP_SHARE;
  });
}

export { muscleShares };

export type MuscleVolume = { sets: number; volumeKg: number };

/** Hard sets and volume per muscle for the sets of [from, to] (days inclusive). */
export function muscleVolume(
  sets: readonly VolumeSet[],
  musclesOf: (exerciseId: string) => ExerciseMuscles | undefined,
  from: string,
  to: string,
): Record<Muscle, MuscleVolume> {
  const out = Object.fromEntries(
    balanceMuscles.map(({ muscle }) => [muscle, { sets: 0, volumeKg: 0 }]),
  ) as Record<Muscle, MuscleVolume>;
  const inRange = sets.filter((s) => s.day >= from && s.day <= to);
  const hard = new Set(hardSets(inRange));
  for (const s of inRange) {
    const m = musclesOf(s.exerciseId);
    if (!m) continue;
    const kgReps =
      s.weightKg != null && s.weightKg > 0 && s.reps != null && s.reps > 0
        ? s.weightKg * s.reps
        : 0;
    for (const [muscle, share] of muscleShares(m)) {
      if (!out[muscle]) continue;
      if (hard.has(s)) out[muscle].sets += share;
      out[muscle].volumeKg += kgReps * share;
    }
  }
  return out;
}

export type BalanceRange = 'this' | 'last' | 'avg4';
export const balanceRanges: BalanceRange[] = ['this', 'last', 'avg4'];

/**
 * Days of a range, following the user's week start: this week (up to today), last week, or the
 * four whole weeks before this one (the week in progress would pull the average down).
 */
export function rangeDays(
  range: BalanceRange,
  today: string,
  weekStart: 'mon' | 'sun',
): { from: string; to: string; weeks: number } {
  const start = weekOf(today, weekStart)[0];
  if (range === 'this') return { from: start, to: today, weeks: 1 };
  if (range === 'last') return { from: addDays(start, -7), to: addDays(start, -1), weeks: 1 };
  return { from: addDays(start, -28), to: addDays(start, -1), weeks: 4 };
}

/** `none`: a helper muscle, shown without a guideline. */
export type GuideStatus = 'under' | 'within' | 'over' | 'none';

/** Where a number of weekly sets sits against a guideline (null: no guideline). */
export function guideStatus(
  sets: number,
  guide: SetsGuide | null = WEEKLY_SETS_GUIDE,
): GuideStatus {
  if (!guide) return 'none';
  if (sets < guide.min) return 'under';
  if (sets > guide.max) return 'over';
  return 'within';
}

export type BalanceRow = {
  muscle: Muscle;
  group: StrengthGroup;
  /** Hard sets per week: exact quarters for one week, one decimal for the 4-week average. */
  sets: number;
  /** Volume (kg × reps) per week, rounded to the kilogram. */
  volumeKg: number;
  /** null for the helper muscles. */
  guide: SetsGuide | null;
  status: GuideStatus;
};

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** One row per muscle (all 17), in group order, for a range. */
export function muscleBalance(
  sets: readonly VolumeSet[],
  musclesOf: (exerciseId: string) => ExerciseMuscles | undefined,
  range: BalanceRange,
  today: string,
  weekStart: 'mon' | 'sun',
): BalanceRow[] {
  const { from, to, weeks } = rangeDays(range, today, weekStart);
  const v = muscleVolume(sets, musclesOf, from, to);
  return balanceMuscles.map(({ muscle, group }) => {
    const perWeek = round(v[muscle].sets / weeks, weeks === 1 ? 2 : 1);
    const guide = guideOf(muscle);
    return {
      muscle,
      group,
      sets: perWeek,
      volumeKg: Math.round(v[muscle].volumeKg / weeks),
      guide,
      status: guideStatus(perWeek, guide),
    };
  });
}

/**
 * The muscles with a guideline that sit below it, fewest sets first (display order on a tie);
 * empty when nothing was trained.
 */
export function behindList(rows: readonly BalanceRow[]): BalanceRow[] {
  if (!rows.some((r) => r.sets > 0)) return [];
  return rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.status === 'under')
    .sort((a, b) => a.r.sets - b.r.sets || a.i - b.i)
    .map(({ r }) => r);
}

/**
 * The muscle furthest below the guideline (fewest sets; the first in display order on a tie), or
 * null when nothing was trained or every guided muscle reaches the guideline.
 */
export function mostBehind(rows: readonly BalanceRow[]): BalanceRow | null {
  return behindList(rows)[0] ?? null;
}

/** How many muscles sit within the guideline. */
export function withinCount(rows: readonly BalanceRow[]): number {
  return rows.filter((r) => r.status === 'within').length;
}

/** How many muscles have a guideline (the "of N" of the summary). */
export function guidedCount(rows: readonly BalanceRow[]): number {
  return rows.filter((r) => r.guide != null).length;
}

/** Sets as written: whole numbers plain, otherwise up to two decimals ("2.5", "0.25", "1.8"). */
export function setsText(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round(n, 2));
}

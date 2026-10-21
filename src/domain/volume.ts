import { addDays, weekOf } from './day';
import type { Muscle } from './muscles';

/**
 * Weekly training balance (DECISIONS 121): hard sets and volume per muscle group per week.
 *
 * - A **hard set** is a completed main set (drop_index 0, DECISIONS 54) of a finished workout
 *   that is not a warm-up. A warm-up is a weighted set lighter than `WARM_UP_SHARE` of the
 *   heaviest main set of the same exercise in the same workout (the app has no warm-up flag;
 *   progression already treats lighter sets as warm-ups). Sets without weight (bodyweight, reps,
 *   time) all count. A set logged with 0 reps does not.
 * - The exercise's **primary** muscle gets 1 set, each **secondary** muscle 0.5 (the catalogue's
 *   `primary_muscle` / `secondary_muscles`).
 * - **Volume** (kg × reps) follows the volume rule of the views: every completed weighted set,
 *   drops included, shared the same way (primary × 1, secondary × 0.5). A secondary figure.
 */

export const WARM_UP_SHARE = 0.6;
export const SECONDARY_SHARE = 0.5;

/**
 * Evidence-based guideline of weekly hard sets per muscle group for growth: about 10 to 20.
 * A guide shown as a band, never a judgment.
 */
export const WEEKLY_SETS_GUIDE = { min: 10, max: 20 } as const;

export type Movement = 'push' | 'pull' | 'legs' | 'core';
export const movements: Movement[] = ['push', 'pull', 'legs', 'core'];

/** Every muscle of the catalogue in its movement group, in display order. */
export const balanceMuscles: { muscle: Muscle; movement: Movement }[] = [
  { muscle: 'chest', movement: 'push' },
  { muscle: 'shoulders', movement: 'push' },
  { muscle: 'triceps', movement: 'push' },
  { muscle: 'back', movement: 'pull' },
  { muscle: 'biceps', movement: 'pull' },
  { muscle: 'legs', movement: 'legs' },
  { muscle: 'glutes', movement: 'legs' },
  { muscle: 'abs', movement: 'core' },
];

export type VolumeSet = {
  sessionId: string;
  exerciseId: string;
  /** The user's local day of the workout. */
  day: string;
  dropIndex: number;
  weightKg: number | null;
  reps: number | null;
};

export type ExerciseMuscles = { primary: Muscle; secondary: readonly Muscle[] };

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

/** Share of a set each muscle of an exercise gets: primary 1, each secondary 0.5. */
export function muscleShares(m: ExerciseMuscles): Map<Muscle, number> {
  const shares = new Map<Muscle, number>([[m.primary, 1]]);
  for (const s of m.secondary) if (!shares.has(s)) shares.set(s, SECONDARY_SHARE);
  return shares;
}

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

export type GuideStatus = 'under' | 'within' | 'over';

/** Where a number of weekly sets sits against the guideline. */
export function guideStatus(sets: number): GuideStatus {
  if (sets < WEEKLY_SETS_GUIDE.min) return 'under';
  if (sets > WEEKLY_SETS_GUIDE.max) return 'over';
  return 'within';
}

export type BalanceRow = {
  muscle: Muscle;
  movement: Movement;
  /** Hard sets per week (an average for `avg4`), rounded to one decimal. */
  sets: number;
  /** Volume (kg × reps) per week, rounded to the kilogram. */
  volumeKg: number;
  status: GuideStatus;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** One row per muscle of the catalogue, in movement order, for a range. */
export function muscleBalance(
  sets: readonly VolumeSet[],
  musclesOf: (exerciseId: string) => ExerciseMuscles | undefined,
  range: BalanceRange,
  today: string,
  weekStart: 'mon' | 'sun',
): BalanceRow[] {
  const { from, to, weeks } = rangeDays(range, today, weekStart);
  const v = muscleVolume(sets, musclesOf, from, to);
  return balanceMuscles.map(({ muscle, movement }) => {
    const perWeek = round1(v[muscle].sets / weeks);
    return {
      muscle,
      movement,
      sets: perWeek,
      volumeKg: Math.round(v[muscle].volumeKg / weeks),
      status: guideStatus(perWeek),
    };
  });
}

/**
 * The group furthest below the guideline (fewest sets; the first in display order on a tie), or
 * null when nothing was trained or every group reaches the guideline.
 */
export function mostBehind(rows: readonly BalanceRow[]): BalanceRow | null {
  if (!rows.some((r) => r.sets > 0)) return null;
  let low: BalanceRow | null = null;
  for (const r of rows) if (r.status === 'under' && (low == null || r.sets < low.sets)) low = r;
  return low;
}

/** How many groups sit within the guideline. */
export function withinCount(rows: readonly BalanceRow[]): number {
  return rows.filter((r) => r.status === 'within').length;
}

/** Strength maths. The same rules live in SQL (epley_1rm, exercise_records): keep them in sync. */

export type LoggedSet = { weightKg: number; reps: number; completed: boolean };

/** Epley estimated 1RM: weight × (1 + reps / 30). Valid for 1–12 reps; 1 rep is the weight. */
export function epley1RM(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

/** Heaviest completed weight, whatever the reps. */
export function actualMax(sets: readonly LoggedSet[]): number | null {
  const weights = sets.filter((s) => s.completed && s.weightKg > 0).map((s) => s.weightKg);
  return weights.length ? Math.max(...weights) : null;
}

/** Best estimated 1RM among the completed sets. */
export function bestEstimated1RM(sets: readonly LoggedSet[]): number | null {
  const values = sets
    .filter((s) => s.completed)
    .map((s) => epley1RM(s.weightKg, s.reps))
    .filter((v): v is number => v != null);
  return values.length ? Math.max(...values) : null;
}

export type RecordKind = 'max' | 'est1rm';

/**
 * Records set by a finished session compared with the previous bests: "NEW MAX" and
 * "NEW EST. 1RM" in the summary. The first time an exercise is done nothing is a record
 * (there is nothing to beat).
 */
export function detectRecords(
  previous: { actualMax: number | null; est1rm: number | null },
  sets: readonly LoggedSet[],
): { kind: RecordKind; value: number; was: number }[] {
  const records: { kind: RecordKind; value: number; was: number }[] = [];
  const max = actualMax(sets);
  if (max != null && previous.actualMax != null && max > previous.actualMax) {
    records.push({ kind: 'max', value: max, was: previous.actualMax });
  }
  const est = bestEstimated1RM(sets);
  if (est != null && previous.est1rm != null && est > previous.est1rm) {
    records.push({ kind: 'est1rm', value: est, was: previous.est1rm });
  }
  return records;
}

/** % change between two estimated 1RM values, one decimal. */
export function percentChange(first: number, last: number): number {
  return Math.round(((last - first) / first) * 1000) / 10;
}

/**
 * Strength score: average % change weighted by the number of sets of each exercise.
 * Exercises are those trained on at least two days in the period (see strength_by_exercise).
 */
export function weightedStrengthScore(
  items: readonly { pctChange: number; sets: number }[],
): number | null {
  const totalSets = items.reduce((sum, i) => sum + i.sets, 0);
  if (totalSets === 0) return null;
  const score = items.reduce((sum, i) => sum + i.pctChange * i.sets, 0) / totalSets;
  return Math.round(score * 10) / 10;
}

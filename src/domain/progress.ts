import { addDays, daysBetween } from './day';
import { strengthGroup, type Muscle, type StrengthGroup } from './muscles';

// --- periods -----------------------------------------------------------------------------------

export type Period = '4w' | '12w' | '1y' | 'all';
export const periods: Period[] = ['4w', '12w', '1y', 'all'];

/** First day of a period ending today ("ALL" starts at the first entry, or 12 weeks ago). */
export function periodStart(period: Period, today: string, firstEntry: string | null): string {
  switch (period) {
    case '4w':
      return addDays(today, -4 * 7);
    case '12w':
      return addDays(today, -12 * 7);
    case '1y':
      return addDays(today, -365);
    default:
      return firstEntry && firstEntry < today ? firstEntry : addDays(today, -12 * 7);
  }
}

/** How many columns a chart of the period has: weekly up to 12 weeks, then 12 equal slices. */
export function bucketCount(period: Period): number {
  return period === '4w' ? 4 : 12;
}

// --- time series -------------------------------------------------------------------------------

export type Point = { day: string; value: number };

/**
 * Averages of `n` equal time slices of [from, to]. Empty slices repeat the last known value (the
 * trend line does not drop to zero when you skip a week); leading empty slices are null.
 */
export function bucketAverages(
  points: readonly Point[],
  from: string,
  to: string,
  n: number,
): (number | null)[] {
  const total = Math.max(1, daysBetween(from, to) + 1);
  const sums = new Array<number>(n).fill(0);
  const counts = new Array<number>(n).fill(0);
  for (const p of points) {
    if (p.day < from || p.day > to) continue;
    const i = Math.min(n - 1, Math.floor((daysBetween(from, p.day) / total) * n));
    sums[i] += p.value;
    counts[i] += 1;
  }
  let last: number | null = null;
  return sums.map((s, i) => {
    if (counts[i] > 0) last = Math.round((s / counts[i]) * 100) / 100;
    return last;
  });
}

/** Average of the points of the last 7 days up to and including `day` (null if none). */
export function sevenDayAverage(points: readonly Point[], day: string): number | null {
  const from = addDays(day, -6);
  const inRange = points.filter((p) => p.day >= from && p.day <= day);
  if (inRange.length === 0) return null;
  return Math.round((inRange.reduce((a, p) => a + p.value, 0) / inRange.length) * 10) / 10;
}

/** Change from the first to the last value (one decimal), or null with fewer than two values. */
export function change(values: readonly (number | null)[]): number | null {
  const real = values.filter((v): v is number => v != null);
  if (real.length < 2) return null;
  return Math.round((real[real.length - 1] - real[0]) * 10) / 10;
}

/** Share of the way from `start` to `target` (0..1), for the goal bar. Works for losing and gaining. */
export function goalProgress(start: number, current: number, target: number): number {
  if (start === target) return 1;
  const p = (current - start) / (target - start);
  return Math.min(1, Math.max(0, p));
}

/**
 * Where a body-fat goal starts from: the last reading on or before the day the goal was set, or
 * (if there was none yet) the first one after it. Null without any reading.
 */
export function goalStartValue(
  readings: readonly { day: string; value: number | null }[],
  goalDay: string,
): number | null {
  const known = readings.filter((r) => r.value != null).sort((a, b) => a.day.localeCompare(b.day));
  const before = known.filter((r) => r.day <= goalDay);
  return (before.length > 0 ? before[before.length - 1] : known[0])?.value ?? null;
}

// --- body composition --------------------------------------------------------------------------

/** Lean and fat mass from weight and body-fat percentage. */
export function bodyMasses(weightKg: number, bodyFatPct: number) {
  const fat = (weightKg * bodyFatPct) / 100;
  return { fatKg: Math.round(fat * 10) / 10, leanKg: Math.round((weightKg - fat) * 10) / 10 };
}

// --- strength score ----------------------------------------------------------------------------

export type DailyE1rm = {
  exerciseId: string;
  day: string;
  bestE1rmKg: number | null;
  sets: number;
  volumeKg: number;
};

export type ExerciseChange = {
  exerciseId: string;
  firstKg: number;
  lastKg: number;
  pctChange: number;
  /** Sets in the days that have an estimated 1RM. */
  sets: number;
};

/**
 * Change of the estimated 1RM per exercise: last value vs first value of the period, only for
 * exercises trained on at least two days. Same rule as the SQL function strength_by_exercise.
 */
export function exerciseChanges(
  rows: readonly DailyE1rm[],
  from: string,
  to: string,
): ExerciseChange[] {
  const byExercise = new Map<string, DailyE1rm[]>();
  for (const r of rows) {
    if (r.day < from || r.day > to || r.bestE1rmKg == null) continue;
    byExercise.set(r.exerciseId, [...(byExercise.get(r.exerciseId) ?? []), r]);
  }
  const out: ExerciseChange[] = [];
  for (const [exerciseId, days] of byExercise) {
    if (days.length < 2) continue;
    const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
    const firstKg = sorted[0].bestE1rmKg!;
    const lastKg = sorted[sorted.length - 1].bestE1rmKg!;
    out.push({
      exerciseId,
      firstKg,
      lastKg,
      pctChange: Math.round(((lastKg - firstKg) / firstKg) * 1000) / 10,
      sets: sorted.reduce((a, d) => a + d.sets, 0),
    });
  }
  return out;
}

/** Set-weighted average % change (one decimal), or null when nothing qualifies. */
export function weightedScore(
  changes: readonly { pctChange: number; sets: number }[],
): number | null {
  const sets = changes.reduce((a, c) => a + c.sets, 0);
  if (sets === 0) return null;
  return Math.round((changes.reduce((a, c) => a + c.pctChange * c.sets, 0) / sets) * 10) / 10;
}

export type GroupScore = { group: StrengthGroup; pctChange: number; sets: number };

/** Score per muscle group (groups with no qualifying exercise are left out), best first. */
export function groupScores(
  changes: readonly ExerciseChange[],
  muscleOf: (exerciseId: string) => Muscle | undefined,
): GroupScore[] {
  const groups = new Map<StrengthGroup, ExerciseChange[]>();
  for (const c of changes) {
    const m = muscleOf(c.exerciseId);
    if (!m) continue;
    const g = strengthGroup(m);
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  return [...groups.entries()]
    .map(([group, list]) => ({
      group,
      pctChange: weightedScore(list) ?? 0,
      sets: list.reduce((a, c) => a + c.sets, 0),
    }))
    .sort((a, b) => b.pctChange - a.pctChange);
}

/** Overall score at the end of each slice of the period: the line of the strength chart. */
export function scoreSeries(
  rows: readonly DailyE1rm[],
  from: string,
  to: string,
  n: number,
): (number | null)[] {
  const total = Math.max(1, daysBetween(from, to) + 1);
  return Array.from({ length: n }, (_, i) => {
    const end = addDays(from, Math.ceil(((i + 1) / n) * total) - 1);
    return weightedScore(exerciseChanges(rows, from, end > to ? to : end));
  });
}

/** Weekly training volume change: last 4 weeks average vs the first 4 weeks of the period. */
export function weeklyVolumeChange(
  rows: readonly DailyE1rm[],
  from: string,
  to: string,
): number | null {
  const weeks = Math.max(1, Math.round((daysBetween(from, to) + 1) / 7));
  const span = Math.min(4, Math.floor(weeks / 2));
  if (span < 1) return null;
  const sum = (a: string, b: string) =>
    rows.filter((r) => r.day >= a && r.day <= b).reduce((s, r) => s + r.volumeKg, 0);
  const head = sum(from, addDays(from, span * 7 - 1)) / span;
  const tail = sum(addDays(to, -(span * 7 - 1)), to) / span;
  if (head <= 0) return null;
  return Math.round(((tail - head) / head) * 100);
}

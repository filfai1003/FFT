import { addDays } from '@/domain/day';
import { bucketAverages, change, type Point } from '@/domain/progress';

/** What the Home weight card shows: the weight or the body fat (DECISIONS 128). */
export type BodyView = 'weight' | 'bodyFat';

/** The Home card's period: the last six weeks, one weekly average per point (as on Progress). */
export const HOME_BODY_WEEKS = 6;

export type BodyCardEntry = {
  day: string;
  weightKg?: number | null;
  bodyFatPct?: number | null;
};

export type HomeBodySeries = {
  /** The latest value logged on or before the shown day (any time back), kg or %. */
  latest: number | null;
  latestDay: string | null;
  /** First day of the period. */
  from: string;
  /** Weekly averages, oldest first; empty unless two values were logged in the period. */
  line: number[];
  /** Change from the first to the last value of the period (one decimal), null under two. */
  delta: number | null;
};

/**
 * The weight or body fat line of the Home card, as the shown day saw it: nothing logged after
 * `day` counts (a past day on Home, DECISIONS 123). Entries may come in any order.
 */
export function homeBodySeries(
  entries: readonly BodyCardEntry[],
  view: BodyView,
  day: string,
  weeks = HOME_BODY_WEEKS,
): HomeBodySeries {
  const from = addDays(day, -weeks * 7);
  const all: Point[] = entries
    .map((e) => ({ day: e.day, value: view === 'weight' ? e.weightKg : e.bodyFatPct }))
    .filter((p): p is Point => p.value != null && p.day <= day)
    .sort((a, b) => a.day.localeCompare(b.day));
  const inPeriod = all.filter((p) => p.day >= from);
  const last = all.at(-1) ?? null;
  // A line needs two values logged in the period: the weekly buckets carry the last one forward,
  // so one entry would draw a flat line (same rule as Progress, DECISIONS 114).
  const line =
    inPeriod.length > 1
      ? bucketAverages(inPeriod, from, day, weeks).filter((v): v is number => v != null)
      : [];
  return {
    latest: last?.value ?? null,
    latestDay: last?.day ?? null,
    from,
    line,
    delta: change(inPeriod.map((p) => p.value)),
  };
}

/** Whether any body fat was logged by the shown day: only then the card offers the switch. */
export function hasBodyFat(entries: readonly BodyCardEntry[], day: string): boolean {
  return entries.some((e) => e.bodyFatPct != null && e.day <= day);
}

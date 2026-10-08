import { create } from 'zustand';
import {
  bodyMasses,
  bucketAverages,
  bucketCount,
  change,
  periodStart,
  sevenDayAverage,
  type Period,
  type Point,
} from '@/domain/progress';
import type { BodyEntry, MeasureKey } from './data';
import { measureKeys } from './data';

/** The time range chosen on the Progress tab (4 WK / 12 WK / 1 YR / ALL), shared by its screens. */
export const useProgressPeriod = create<{ period: Period; setPeriod: (p: Period) => void }>(
  (set) => ({
    period: '12w',
    setPeriod: (period) => set({ period }),
  }),
);

const lastOf = <T>(list: readonly T[]) => list[list.length - 1];

export type BodyProgress = {
  from: string;
  to: string;
  weight: {
    latestKg: number | null;
    latestDay: string | null;
    /** Weekly (or monthly) averages for the chart. */
    buckets: (number | null)[];
    deltaKg: number | null;
    sevenDayKg: number | null;
    points: Point[];
  };
  bodyFat: {
    latestPct: number | null;
    buckets: (number | null)[];
    deltaPts: number | null;
    leanKg: number | null;
    fatKg: number | null;
    leanDelta: number | null;
    fatDelta: number | null;
    method: BodyEntry['method'];
  };
  /** Latest value of each measurement and its change since the start of the period. */
  measures: Record<MeasureKey, { value: number; delta: number } | null>;
};

/** Everything the weight / body fat / measurements screens show, from the raw entries. */
export function bodyProgress(
  entries: readonly BodyEntry[],
  period: Period,
  today: string,
): BodyProgress {
  const first = entries[0]?.day ?? null;
  const from = periodStart(period, today, first);
  const n = bucketCount(period);
  const inPeriod = entries.filter((e) => e.day >= from && e.day <= today);

  const weightAll: Point[] = entries
    .filter((e) => e.weightKg != null)
    .map((e) => ({ day: e.day, value: e.weightKg! }));
  const weightPoints = weightAll.filter((p) => p.day >= from);
  const weightBuckets = bucketAverages(weightPoints, from, today, n);

  const bfAll = entries.filter((e) => e.bodyFatPct != null);
  const bfPoints: Point[] = bfAll
    .filter((e) => e.day >= from)
    .map((e) => ({ day: e.day, value: e.bodyFatPct! }));
  const bfBuckets = bucketAverages(bfPoints, from, today, n);

  // Lean / fat mass at the latest entry that has both, versus the first one of the period.
  const both = inPeriod.filter((e) => e.weightKg != null && e.bodyFatPct != null);
  const lastBoth = both.length ? lastOf(both) : null;
  const firstBoth = both.length ? both[0] : null;
  const lastMass = lastBoth ? bodyMasses(lastBoth.weightKg!, lastBoth.bodyFatPct!) : null;
  const firstMass = firstBoth ? bodyMasses(firstBoth.weightKg!, firstBoth.bodyFatPct!) : null;
  const diff = (a: number | undefined, b: number | undefined) =>
    a != null && b != null && both.length >= 2 ? Math.round((a - b) * 10) / 10 : null;

  const measures = {} as BodyProgress['measures'];
  for (const k of measureKeys) {
    const withValue = entries.filter((e) => e.measures[k] != null);
    const inRange = withValue.filter((e) => e.day >= from);
    if (withValue.length === 0) {
      measures[k] = null;
      continue;
    }
    const latest = lastOf(withValue).measures[k]!;
    const base = (inRange[0] ?? withValue[0]).measures[k]!;
    measures[k] = { value: latest, delta: Math.round((latest - base) * 10) / 10 };
  }

  const latestWeight = weightAll.length ? lastOf(weightAll) : null;
  const latestBf = bfAll.length ? lastOf(bfAll) : null;

  return {
    from,
    to: today,
    weight: {
      latestKg: latestWeight?.value ?? null,
      latestDay: latestWeight?.day ?? null,
      buckets: weightBuckets,
      deltaKg: change(weightPoints.map((p) => p.value)),
      sevenDayKg: sevenDayAverage(weightAll, today),
      points: weightPoints,
    },
    bodyFat: {
      latestPct: latestBf?.bodyFatPct ?? null,
      buckets: bfBuckets,
      deltaPts: change(bfPoints.map((p) => p.value)),
      leanKg: lastMass?.leanKg ?? null,
      fatKg: lastMass?.fatKg ?? null,
      leanDelta: diff(lastMass?.leanKg, firstMass?.leanKg),
      fatDelta: diff(lastMass?.fatKg, firstMass?.fatKg),
      method: latestBf?.method ?? null,
    },
    measures,
  };
}

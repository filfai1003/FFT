import {
  bucketCount,
  exerciseChanges,
  groupScores,
  periodStart,
  scoreSeries,
  weeklyVolumeChange,
  weightedScore,
  type ExerciseChange,
  type Period,
} from '@/domain/progress';
import { strengthGroup, type Muscle, type StrengthGroup } from '@/domain/muscles';
import { daysBetween } from '@/domain/day';
import { useToday } from '@/features/profile/use-today';
import { useExercises } from '@/features/train/exercises';
import { useDailyE1rm } from './data';

/** The strength score and everything under it for a period, computed on the device. */
export function useStrength(period: Period) {
  const daily = useDailyE1rm();
  const exercises = useExercises();
  const today = useToday();

  const rows = daily.data ?? [];
  const from = periodStart(period, today, rows[0]?.day ?? null);
  const muscleOf = (id: string): Muscle | undefined =>
    exercises.data?.find((e) => e.id === id)?.primaryMuscle;

  const changes = exerciseChanges(rows, from, today);
  const series = scoreSeries(rows, from, today, bucketCount(period));

  return {
    isPending: daily.isPending || exercises.isPending,
    from,
    to: today,
    weeks: Math.max(1, Math.round((daysBetween(from, today) + 1) / 7)),
    overall: weightedScore(changes),
    series,
    groups: groupScores(changes, muscleOf),
    changes,
    rows,
    muscleOf,
    exerciseName: (id: string) => exercises.data?.find((e) => e.id === id),
  };
}

/** The exercises of one group, best change first, plus the group's stats. */
export function groupDetail(
  s: ReturnType<typeof useStrength>,
  group: StrengthGroup,
): {
  changes: ExerciseChange[];
  score: number | null;
  sets: number;
  setsPerWeek: number;
  volumeChange: number | null;
  /** The group's own score over the period (the overall series mixes every group). */
  series: (number | null)[];
} {
  const own = s.changes.filter((c) => {
    const m = s.muscleOf(c.exerciseId);
    return m != null && strengthGroup(m) === group;
  });
  const ids = new Set(own.map((c) => c.exerciseId));
  const rows = s.rows.filter((r) => ids.has(r.exerciseId) && r.day >= s.from && r.day <= s.to);
  const sets = rows.reduce((a, r) => a + r.sets, 0);
  return {
    changes: [...own].sort((a, b) => b.pctChange - a.pctChange),
    score: weightedScore(own),
    sets,
    setsPerWeek: Math.round((sets / s.weeks) * 10) / 10,
    volumeChange: weeklyVolumeChange(rows, s.from, s.to),
    series: scoreSeries(
      s.rows.filter((r) => {
        const m = s.muscleOf(r.exerciseId);
        return m != null && strengthGroup(m) === group;
      }),
      s.from,
      s.to,
      s.series.length,
    ),
  };
}

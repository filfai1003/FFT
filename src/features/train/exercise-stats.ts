import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

export type ExerciseRecord = {
  exerciseId: string;
  actualMaxKg: number | null;
  est1rmKg: number | null;
  completedSets: number;
  bestReps: number | null;
  bestDurationS: number | null;
};

export const recordKeys = {
  all: ['records'] as const,
  trend: (id: string) => ['records', 'trend', id] as const,
};

type RecordRow = {
  exercise_id: string | null;
  actual_max_kg: number | null;
  est_1rm_kg: number | null;
  completed_sets: number | null;
  best_reps: number | null;
  best_duration_s: number | null;
};

export function toRecord(r: RecordRow): ExerciseRecord {
  return {
    exerciseId: r.exercise_id ?? '',
    actualMaxKg: r.actual_max_kg != null ? Number(r.actual_max_kg) : null,
    est1rmKg: r.est_1rm_kg != null ? Number(r.est_1rm_kg) : null,
    completedSets: Number(r.completed_sets ?? 0),
    bestReps: r.best_reps,
    bestDurationS: r.best_duration_s,
  };
}

/** Records of every exercise the user has done, by exercise id. */
export function useRecords() {
  return useQuery({
    queryKey: recordKeys.all,
    queryFn: async () => {
      const { data, error } = await getSupabase().from('exercise_records').select('*');
      if (error) throw error;
      return new Map((data as RecordRow[]).map((r) => [r.exercise_id ?? '', toRecord(r)]));
    },
  });
}

export type TrendPoint = { day: string; est1rmKg: number | null; maxKg: number | null };

/** Best estimated 1RM and heaviest weight per training day, oldest first. */
export function useExerciseTrend(exerciseId: string | undefined) {
  return useQuery({
    queryKey: recordKeys.trend(exerciseId ?? ''),
    enabled: !!exerciseId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('exercise_e1rm_daily')
        .select('day, best_e1rm_kg, best_weight_kg')
        .eq('exercise_id', exerciseId!)
        .order('day', { ascending: true });
      if (error) throw error;
      return (
        data as { day: string; best_e1rm_kg: number | null; best_weight_kg: number | null }[]
      ).map<TrendPoint>((r) => ({
        day: r.day,
        est1rmKg: r.best_e1rm_kg != null ? Number(r.best_e1rm_kg) : null,
        maxKg: r.best_weight_kg != null ? Number(r.best_weight_kg) : null,
      }));
    },
  });
}

/** Previous bests (kg) of some exercises, to detect new records when a workout finishes. */
export async function fetchBests(
  exerciseIds: string[],
): Promise<Record<string, { actualMax: number | null; est1rm: number | null }>> {
  if (exerciseIds.length === 0) return {};
  try {
    const { data, error } = await getSupabase()
      .from('exercise_records')
      .select('exercise_id, actual_max_kg, est_1rm_kg')
      .in('exercise_id', exerciseIds);
    if (error || !data) return {};
    return Object.fromEntries(
      (data as RecordRow[]).map((r) => [
        r.exercise_id ?? '',
        {
          actualMax: r.actual_max_kg != null ? Number(r.actual_max_kg) : null,
          est1rm: r.est_1rm_kg != null ? Number(r.est_1rm_kg) : null,
        },
      ]),
    );
  } catch {
    return {}; // offline: no records are announced, nothing is lost
  }
}

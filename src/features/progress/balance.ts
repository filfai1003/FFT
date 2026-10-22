import { useQuery } from '@tanstack/react-query';
import { addDays, deviceTimeZone, localDay } from '@/domain/day';
import {
  behindList,
  guidedCount,
  mostBehind,
  muscleBalance,
  rangeDays,
  withinCount,
  type BalanceRange,
  type ExerciseMuscles,
  type VolumeSet,
} from '@/domain/volume';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useExercises } from '@/features/train/exercises';
import { getSupabase } from '@/lib/supabase';

/** Under ['strength'], so finishing a workout refreshes it with the strength numbers. */
export const balanceKeys = { sets: (from: string) => ['strength', 'balance', from] as const };

type Row = {
  session_id: string;
  exercise_id: string;
  drop_index: number | null;
  weight_kg: number | string | null;
  reps: number | null;
  workout_sessions: { started_at: string };
};

/**
 * Completed sets of finished workouts from `from` on (the device database, never the server).
 * One day earlier on the timestamp covers any time zone; the day is then the user's local one.
 */
export async function fetchVolumeSets(from: string, timeZone: string): Promise<VolumeSet[]> {
  const { data, error } = await getSupabase()
    .from('session_sets')
    .select(
      'session_id, exercise_id, drop_index, weight_kg, reps, workout_sessions!inner(started_at, status, deleted_at)',
    )
    .not('completed_at', 'is', null)
    .is('deleted_at', null)
    .eq('workout_sessions.status', 'done')
    .is('workout_sessions.deleted_at', null)
    .gte('workout_sessions.started_at', `${addDays(from, -1)}T00:00:00.000Z`);
  if (error) throw error;
  return (data as unknown as Row[])
    .map((r) => ({
      sessionId: r.session_id,
      exerciseId: r.exercise_id,
      day: localDay(new Date(r.workout_sessions.started_at), timeZone),
      dropIndex: Number(r.drop_index ?? 0),
      weightKg: r.weight_kg == null ? null : Number(r.weight_kg),
      reps: r.reps == null ? null : Number(r.reps),
    }))
    .filter((s) => s.day >= from);
}

/** Training balance of a range: hard sets and volume per muscle (DECISIONS 121, 125). */
export function useBalance(range: BalanceRange) {
  const today = useToday();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const timeZone = useProfile().data?.timezone ?? deviceTimeZone();
  const exercises = useExercises();
  // One query covers every range: the four weeks before this one and this week.
  const from = rangeDays('avg4', today, weekStart).from;
  const sets = useQuery({
    queryKey: balanceKeys.sets(from),
    queryFn: () => fetchVolumeSets(from, timeZone),
  });

  const byId = new Map<string, ExerciseMuscles>(
    (exercises.data ?? []).map((e) => [
      e.id,
      { primary: e.primaryMuscle, secondary: e.secondaryMuscles, indirect: e.indirectMuscles },
    ]),
  );
  const rows = muscleBalance(sets.data ?? [], (id) => byId.get(id), range, today, weekStart);
  return {
    isPending: sets.isPending || exercises.isPending,
    rows,
    behind: mostBehind(rows),
    /** The muscles with a guideline below it, fewest sets first. */
    behindList: behindList(rows),
    within: withinCount(rows),
    /** How many muscles have a guideline (the "of N"). */
    guided: guidedCount(rows),
    empty: rows.every((r) => r.sets === 0),
  };
}

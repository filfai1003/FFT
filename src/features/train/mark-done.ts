import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isOutOfOrder } from '@/domain/rotation';
import { useSessionStore as useAuth } from '@/features/auth/session-store';
import { getSupabase } from '@/lib/supabase';
import { newId } from '@/lib/uuid';
import { historyKeys } from './history';
import { planKeys, type PlanDayView, type PlanView, type Rotation } from './plans';

/**
 * A workout done without logging it in the app (or on another day): it is saved as finished on
 * that day, with the plan day's exercises and no sets. It counts for the rotation like any other
 * workout. Returns the id, so it can be taken back (UNDO).
 */
export function useMarkWorkoutDone() {
  const userId = useAuth((s) => s.userId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      day: string;
      name: string;
      plan?: PlanView | null;
      planDay?: PlanDayView | null;
      rotation?: Rotation | null;
    }) => {
      const id = newId();
      // Noon of that day, on this phone's clock: the day stays the same in any nearby time zone.
      const at = new Date(`${v.day}T12:00:00`).toISOString();
      const db = getSupabase();
      const { error } = await db.from('workout_sessions').insert({
        id,
        user_id: userId!,
        plan_id: v.plan?.id ?? null,
        plan_day_id: v.planDay?.id ?? null,
        day_name: v.name,
        cycle_number: v.planDay ? (v.rotation?.state.cycle ?? 1) : null,
        out_of_order:
          v.planDay && v.rotation ? isOutOfOrder(v.rotation.state, v.planDay.id) : false,
        started_at: at,
        ended_at: at,
        status: 'done',
      });
      if (error) throw error;
      const exercises = (v.planDay?.exercises ?? []).filter(
        (e, i, all) => all.findIndex((x) => x.exerciseId === e.exerciseId) === i,
      );
      if (exercises.length > 0) {
        const res = await db.from('session_exercises').insert(
          exercises.map((e, position) => ({
            id: newId(),
            user_id: userId!,
            session_id: id,
            exercise_id: e.exerciseId,
            position,
            rest_s: e.restS ?? null,
          })),
        );
        if (res.error) throw res.error;
      }
      return id;
    },
    onSuccess: () => invalidateTraining(queryClient),
  });
}

/** Removes a workout from the history (or brings it back, for UNDO). */
export function useSetWorkoutDeleted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, deleted }: { id: string; deleted: boolean }) => {
      const { error } = await getSupabase()
        .from('workout_sessions')
        .update({ deleted_at: deleted ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateTraining(queryClient),
  });
}

function invalidateTraining(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: historyKeys.all }),
    queryClient.invalidateQueries({ queryKey: planKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['plan-sessions'] }),
    queryClient.invalidateQueries({ queryKey: ['diet'] }),
  ]);
}

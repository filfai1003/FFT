import { useRouter } from 'expo-router';
import { isOutOfOrder } from '@/domain/rotation';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import type { Exercise } from '@/features/train/exercises';
import type { PlanDayView, PlanView, Rotation } from '@/features/train/plans';
import i18n from '@/i18n';
import { getSupabase } from '@/lib/supabase';
import { useToastStore } from '@/lib/toast-store';
import { buildSession, type NewExercise, type PreviousSet } from './logic';
import { useSessionStore } from './store';

/** The sets of the last finished session of each exercise ("PREVIOUS" column, pre-filled loads). */
export async function fetchPrevious(exerciseIds: string[]): Promise<Record<string, PreviousSet[]>> {
  if (exerciseIds.length === 0) return {};
  try {
    const { data, error } = await getSupabase().rpc('last_sets', { p_exercise_ids: exerciseIds });
    if (error || !data) return {};
    const byExercise: Record<string, PreviousSet[]> = {};
    for (const row of data as {
      exercise_id: string;
      set_index: number;
      weight_kg: number | null;
      reps: number | null;
      duration_s: number | null;
      distance_m: number | null;
    }[]) {
      (byExercise[row.exercise_id] ??= [])[row.set_index] = {
        weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
        reps: row.reps,
        durationS: row.duration_s,
        distanceM: row.distance_m != null ? Number(row.distance_m) : null,
      };
    }
    // Sets are numbered from 0 in the database: drop holes.
    for (const key of Object.keys(byExercise)) byExercise[key] = byExercise[key].filter(Boolean);
    return byExercise;
  } catch {
    return {}; // offline: start without history, the workout still works
  }
}

export function newExerciseFromCatalogue(
  exercise: Exercise,
  previous: PreviousSet[],
  defaults: { targetSets?: number; targetReps?: string; restS?: number } = {},
): NewExercise {
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    logType: exercise.logType,
    imagePath: exercise.imagePath,
    restS: defaults.restS ?? (exercise.logType === 'weight_reps' ? 90 : 60),
    targetSets: defaults.targetSets ?? 3,
    targetReps: defaults.targetReps,
    previous,
  };
}

export function useStartWorkout() {
  const router = useRouter();
  const start = useSessionStore((s) => s.start);

  /**
   * A workout already in progress is resumed instead of starting another one — unless nothing was
   * logged in it yet (no set done): then it is replaced by the new one, with an UNDO.
   */
  const openActive = () => {
    const { active, discard, start: restore } = useSessionStore.getState();
    if (!active) return false;
    if (!active.exercises.some((e) => e.sets.some((set) => set.done))) {
      discard();
      useToastStore.getState().show({
        message: i18n.t('session.replacedEmpty', { name: active.dayName }),
        actionLabel: i18n.t('common.undo'),
        onAction: () => {
          restore(active);
          router.replace({ pathname: '/session/[sessionId]', params: { sessionId: active.id } });
        },
      });
      return false;
    }
    router.push({ pathname: '/session/[sessionId]', params: { sessionId: active.id } });
    return true;
  };

  /** Starts a plan day (or resumes the workout already in progress). */
  const startDay = async (plan: PlanView, day: PlanDayView, rotation: Rotation | null) => {
    if (openActive()) return;
    const previous = await fetchPrevious(day.exercises.map((e) => e.exerciseId));
    const session = buildSession({
      planId: plan.id,
      planDayId: day.id,
      dayName: day.name,
      cycleNumber: rotation?.state.cycle ?? 1,
      outOfOrder: rotation ? isOutOfOrder(rotation.state, day.id) : false,
      weightUnit: usePreferencesStore.getState().weightUnit,
      now: new Date(),
      exercises: day.exercises.map((e) =>
        newExerciseFromCatalogue(e.exercise, previous[e.exerciseId] ?? [], {
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          restS: e.restS,
        }),
      ),
    });
    start(session);
    router.push({ pathname: '/session/[sessionId]', params: { sessionId: session.id } });
  };

  /** A workout with no exercises: they are added as you go. */
  const startEmpty = (name: string) => {
    if (openActive()) return;
    const session = buildSession({
      planId: null,
      planDayId: null,
      dayName: name,
      cycleNumber: null,
      outOfOrder: false,
      weightUnit: usePreferencesStore.getState().weightUnit,
      now: new Date(),
      exercises: [],
    });
    start(session);
    router.push({ pathname: '/session/[sessionId]', params: { sessionId: session.id } });
  };

  /** Repeats a past workout: same exercises, loads taken from the last time. */
  const startFromExercises = async (
    name: string,
    exercises: { exercise: Exercise; sets: number; restS?: number }[],
  ) => {
    if (openActive()) return;
    const previous = await fetchPrevious(exercises.map((e) => e.exercise.id));
    const session = buildSession({
      planId: null,
      planDayId: null,
      dayName: name,
      cycleNumber: null,
      outOfOrder: false,
      weightUnit: usePreferencesStore.getState().weightUnit,
      now: new Date(),
      exercises: exercises.map((e) =>
        newExerciseFromCatalogue(e.exercise, previous[e.exercise.id] ?? [], {
          targetSets: e.sets,
          restS: e.restS,
        }),
      ),
    });
    start(session);
    router.push({ pathname: '/session/[sessionId]', params: { sessionId: session.id } });
  };

  return { startDay, startEmpty, startFromExercises };
}

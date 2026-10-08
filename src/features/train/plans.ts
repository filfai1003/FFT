import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rotationState, type FinishedSession, type RotationState } from '@/domain/rotation';
import { useSessionStore as useAuth } from '@/features/auth/session-store';
import { getSupabase } from '@/lib/supabase';
import { newId } from '@/lib/uuid';
import { toExercise, type Exercise } from './exercises';

export type PlanStatus = 'draft' | 'active' | 'archived';

export type PlanExerciseView = {
  id: string;
  exerciseId: string;
  position: number;
  targetSets: number;
  targetReps: string;
  restS: number;
  notes: string | null;
  exercise: Exercise;
};

export type PlanDayView = {
  id: string;
  position: number;
  name: string;
  exercises: PlanExerciseView[];
};

export type PlanView = {
  id: string;
  name: string;
  goal: string | null;
  status: PlanStatus;
  source: string;
  days: PlanDayView[];
};

const PLAN_SELECT =
  '*, plan_days(*, plan_exercises(*, exercises(id, owner_id, name, primary_muscle, secondary_muscles, equipment, log_type, image_path)))';

type Raw = {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  source: string;
  deleted_at: string | null;
  plan_days?: {
    id: string;
    position: number;
    name: string;
    deleted_at: string | null;
    plan_exercises?: {
      id: string;
      exercise_id: string;
      position: number;
      target_sets: number;
      target_reps: string;
      rest_s: number;
      notes: string | null;
      deleted_at: string | null;
      exercises: Parameters<typeof toExercise>[0] | null;
    }[];
  }[];
};

/** Database row with its nested days and exercises -> app model (soft-deleted rows dropped). */
export function toPlan(raw: Raw): PlanView {
  const days = (raw.plan_days ?? [])
    .filter((d) => d.deleted_at == null)
    .sort((a, b) => a.position - b.position)
    .map<PlanDayView>((d) => ({
      id: d.id,
      position: d.position,
      name: d.name,
      exercises: (d.plan_exercises ?? [])
        .filter((e) => e.deleted_at == null && e.exercises != null)
        .sort((a, b) => a.position - b.position)
        .map<PlanExerciseView>((e) => ({
          id: e.id,
          exerciseId: e.exercise_id,
          position: e.position,
          targetSets: e.target_sets,
          targetReps: e.target_reps,
          restS: e.rest_s,
          notes: e.notes,
          exercise: toExercise(e.exercises!),
        })),
    }));
  return {
    id: raw.id,
    name: raw.name,
    goal: raw.goal,
    status: raw.status as PlanStatus,
    source: raw.source,
    days,
  };
}

/** "Bench press, incline DB press, +4": the preview line of a day. */
export function dayPreview(day: PlanDayView, shown = 2): { names: string[]; more: number } {
  return {
    names: day.exercises.slice(0, shown).map((e) => e.exercise.name),
    more: Math.max(0, day.exercises.length - shown),
  };
}

/** ~minutes: sets x (45 s of work + rest) over all exercises, rounded to 5. */
export function estimateMinutes(day: PlanDayView): number {
  const seconds = day.exercises.reduce((sum, e) => sum + e.targetSets * (45 + e.restS), 0);
  return Math.max(5, Math.round(seconds / 60 / 5) * 5);
}

export const planKeys = {
  all: ['plans'] as const,
  one: (id: string) => ['plan', id] as const,
  active: ['plan', 'active'] as const,
  sessions: (planId: string) => ['plan-sessions', planId] as const,
};

export function usePlans() {
  return useQuery({
    queryKey: planKeys.all,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('workout_plans')
        .select(PLAN_SELECT)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Raw[]).map(toPlan);
    },
  });
}

export function usePlan(planId: string | undefined) {
  return useQuery({
    queryKey: planKeys.one(planId ?? ''),
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('workout_plans')
        .select(PLAN_SELECT)
        .eq('id', planId!)
        .is('deleted_at', null)
        .single();
      if (error) throw error;
      return toPlan(data as unknown as Raw);
    },
  });
}

/** Plans of the list, the active one first. */
export function useActivePlan() {
  const plans = usePlans();
  return {
    ...plans,
    plan: plans.data?.find((p) => p.status === 'active') ?? null,
    others: plans.data?.filter((p) => p.status !== 'active') ?? [],
  };
}

type RotationRow = {
  id: string;
  plan_day_id: string | null;
  cycle_number: number | null;
  started_at: string;
  out_of_order: boolean;
  day_name: string | null;
};

export type PlanSession = RotationRow;

export function usePlanSessions(planId: string | undefined) {
  return useQuery({
    queryKey: planKeys.sessions(planId ?? ''),
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('workout_sessions')
        .select('id, plan_day_id, cycle_number, started_at, out_of_order, day_name')
        .eq('plan_id', planId!)
        .eq('status', 'done')
        .is('deleted_at', null)
        .order('started_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as RotationRow[];
    },
  });
}

export type Rotation = {
  state: RotationState;
  /** Last workout of each day in the current cycle (for the "DONE · MON" tags). */
  doneThisCycle: Map<string, PlanSession>;
};

/** Rotation of a plan from its finished sessions (see domain/rotation). */
export function useRotation(plan: PlanView | null | undefined): Rotation | null {
  const sessions = usePlanSessions(plan?.id);
  if (!plan || !sessions.data) return null;
  const finished: FinishedSession[] = sessions.data.map((s) => ({
    planDayId: s.plan_day_id,
    cycleNumber: s.cycle_number,
  }));
  const state = rotationState(
    plan.days.map((d) => ({ id: d.id, position: d.position })),
    finished,
  );
  const doneThisCycle = new Map<string, PlanSession>();
  for (const s of sessions.data) {
    if (
      s.plan_day_id &&
      (s.cycle_number ?? 1) === state.cycle &&
      !doneThisCycle.has(s.plan_day_id)
    ) {
      doneThisCycle.set(s.plan_day_id, s);
    }
  }
  return { state, doneThisCycle };
}

// --- mutations ---------------------------------------------------------------------------------

function useUserId() {
  return useAuth((s) => s.userId);
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: planKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['plan'] }),
    ]);
}

export function useCreatePlan() {
  const userId = useUserId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (name: string) => {
      const id = newId();
      const { error } = await getSupabase()
        .from('workout_plans')
        .insert({ id, user_id: userId!, name: name.trim(), status: 'draft' });
      if (error) throw error;
      return id;
    },
    onSuccess: invalidate,
  });
}

export function useUpdatePlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await getSupabase()
        .from('workout_plans')
        .update({ name: name.trim() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetPlanStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PlanStatus }) => {
      const supabase = getSupabase();
      if (status === 'active') {
        // Only one active plan: the previous one is archived first (partial unique index).
        const { error: archiveError } = await supabase
          .from('workout_plans')
          .update({ status: 'archived' })
          .eq('status', 'active')
          .is('deleted_at', null);
        if (archiveError) throw archiveError;
      }
      const { error } = await supabase.from('workout_plans').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeletePlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase()
        .from('workout_plans')
        .update({ deleted_at: new Date().toISOString(), status: 'archived' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDuplicatePlan() {
  const userId = useUserId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ plan, name }: { plan: PlanView; name: string }) => {
      const supabase = getSupabase();
      const planId = newId();
      const planRes = await supabase
        .from('workout_plans')
        .insert({ id: planId, user_id: userId!, name, goal: plan.goal, status: 'draft' });
      if (planRes.error) throw planRes.error;
      for (const day of plan.days) {
        const dayId = newId();
        const dayRes = await supabase.from('plan_days').insert({
          id: dayId,
          user_id: userId!,
          plan_id: planId,
          position: day.position,
          name: day.name,
        });
        if (dayRes.error) throw dayRes.error;
        if (day.exercises.length > 0) {
          const exRes = await supabase.from('plan_exercises').insert(
            day.exercises.map((e) => ({
              id: newId(),
              user_id: userId!,
              plan_day_id: dayId,
              exercise_id: e.exerciseId,
              position: e.position,
              target_sets: e.targetSets,
              target_reps: e.targetReps,
              rest_s: e.restS,
              notes: e.notes,
            })),
          );
          if (exRes.error) throw exRes.error;
        }
      }
      return planId;
    },
    onSuccess: invalidate,
  });
}

export type DayDraftExercise = {
  /** plan_exercises row id (existing) or a new client id. */
  id: string;
  exerciseId: string;
  exercise: Exercise;
  targetSets: number;
  targetReps: string;
  restS: number;
  notes: string;
};

export function useSaveDay() {
  const userId = useUserId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (args: {
      planId: string;
      dayId: string;
      position: number;
      name: string;
      exercises: DayDraftExercise[];
      /** Row ids that existed before and are no longer in the day. */
      removedIds: string[];
    }) => {
      const supabase = getSupabase();
      const day = await supabase.from('plan_days').upsert({
        id: args.dayId,
        user_id: userId!,
        plan_id: args.planId,
        position: args.position,
        name: args.name.trim(),
        deleted_at: null,
      });
      if (day.error) throw day.error;
      if (args.exercises.length > 0) {
        const res = await supabase.from('plan_exercises').upsert(
          args.exercises.map((e, position) => ({
            id: e.id,
            user_id: userId!,
            plan_day_id: args.dayId,
            exercise_id: e.exerciseId,
            position,
            target_sets: e.targetSets,
            target_reps: e.targetReps.trim() || '8-12',
            rest_s: e.restS,
            notes: e.notes.trim() === '' ? null : e.notes.trim(),
            deleted_at: null,
          })),
        );
        if (res.error) throw res.error;
      }
      if (args.removedIds.length > 0) {
        const res = await supabase
          .from('plan_exercises')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', args.removedIds);
        if (res.error) throw res.error;
      }
    },
    onSuccess: invalidate,
  });
}

export function useDeleteDay() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (dayId: string) => {
      const { error } = await getSupabase()
        .from('plan_days')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', dayId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

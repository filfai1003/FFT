import { useMutation, useQueryClient } from '@tanstack/react-query';
import { rebalanceMeals, targetProblem, type Totals } from '@/domain/nutrition';
import {
  matchExercise,
  normalizeName,
  type ImportedDiet,
  type ImportedWorkout,
  type ParsedBundle,
} from '@/domain/plan-import';
import { useSessionStore } from '@/features/auth/session-store';
import { useSaveFixedPlan, useFixedPlan } from '@/features/diet/fixed';
import { useGoalForDay, useSaveGoal } from '@/features/diet/log';
import { useUpdateProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { exerciseKeys } from '@/features/train/exercises';
import { planKeys, useDuplicatePlan, usePlans, type PlanView } from '@/features/train/plans';
import { getSupabase } from '@/lib/supabase';
import { newId } from '@/lib/uuid';

export type ApplyResult = {
  workoutPlanId: string | null;
  workoutUpdated: boolean;
  createdExercises: number;
  skippedExercises: string[];
  dietApplied: boolean;
  /** Name of the archived copy made before an existing plan was changed. */
  backupName: string | null;
};

type Catalogue = { id: string; name: string }[];

/** The id of every exercise name of the plan: catalogue match, a new custom exercise, or null (skipped). */
async function resolveExercises(workout: ImportedWorkout, userId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name')
    .is('deleted_at', null);
  if (error) throw error;
  const known: Catalogue = [...(data as Catalogue)];
  const ids = new Map<string, string | null>();
  let created = 0;
  for (const day of workout.days) {
    for (const e of day.exercises) {
      const key = normalizeName(e.name);
      if (ids.has(key)) continue;
      const found = matchExercise(e.name, known);
      if (found) {
        ids.set(key, found.id);
      } else if (e.newExercise) {
        const id = newId();
        const { error: insertError } = await supabase.from('exercises').insert({
          id,
          owner_id: userId,
          name: e.name,
          primary_muscle: e.newExercise.primaryMuscle,
          secondary_muscles: [],
          equipment: e.newExercise.equipment,
          log_type: e.newExercise.logType,
        });
        if (insertError) throw insertError;
        known.push({ id, name: e.name });
        ids.set(key, id);
        created++;
      } else {
        ids.set(key, null);
      }
    }
  }
  return { ids, created };
}

/**
 * Applies an imported (or AI proposed) workout plan and/or diet to the user's data. A plan that
 * already exists (same id) is updated in place after a backup copy was archived, so nothing is
 * lost; otherwise a new plan is created. The diet replaces the calorie target and the fixed meals.
 */
export function useApplyImport() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.userId);
  const today = useToday();
  const goal = useGoalForDay(today);
  const plans = usePlans();
  const fixed = useFixedPlan();
  const duplicate = useDuplicatePlan();
  const saveGoal = useSaveGoal();
  const saveFixed = useSaveFixedPlan();
  const updateProfile = useUpdateProfile();

  return useMutation({
    mutationFn: async (bundle: ParsedBundle): Promise<ApplyResult> => {
      const result: ApplyResult = {
        workoutPlanId: null,
        workoutUpdated: false,
        createdExercises: 0,
        skippedExercises: [],
        dietApplied: false,
        backupName: null,
      };
      if (bundle.diet) await applyDiet(bundle.diet, result);
      if (bundle.workout) await applyWorkout(bundle.workout, result);
      await queryClient.invalidateQueries({ queryKey: planKeys.all });
      await queryClient.invalidateQueries({ queryKey: ['plan'] });
      await queryClient.invalidateQueries({ queryKey: exerciseKeys.all });
      return result;
    },
  });

  async function applyDiet(diet: ImportedDiet, result: ApplyResult) {
    const maintenance = goal?.maintenanceKcal ?? null;
    const problem = maintenance ? targetProblem(diet.kcal, maintenance) : null;
    if (problem === 'below_minimum')
      throw new Error('The calorie target is below the 1500 kcal minimum.');
    if (problem === 'deficit_too_large')
      throw new Error('The calorie target is more than 25% under your maintenance calories.');

    const tracking = diet.mode === 'tracking';
    // The meals always add up to the daily target.
    const target: Totals = {
      kcal: diet.kcal,
      proteinG: diet.proteinG,
      carbsG: diet.carbsG,
      fatG: diet.fatG,
    };
    const meals = rebalanceMeals(
      target,
      diet.meals.map((m) => ({
        kcal: m.kcal,
        proteinG: m.proteinG,
        carbsG: m.carbsG,
        fatG: m.fatG,
      })),
      -1,
    );
    const ids = diet.meals.map(() => newId());
    await saveGoal.mutateAsync({
      validFrom: today,
      kcal: diet.kcal,
      proteinG: diet.proteinG,
      carbsG: diet.carbsG,
      fatG: diet.fatG,
      trainingDayBonusKcal: goal?.trainingDayBonusKcal ?? 0,
      maintenanceKcal: maintenance,
      waterMl: goal?.waterMl ?? 2000,
    });
    const after = diet.meals.findIndex((m) => m.name === diet.workoutAfter);
    if (!tracking)
      await saveFixed.mutateAsync({
        planId: fixed.data?.id ?? null,
        name: fixed.data?.name ?? 'My meals',
        removedIds: (fixed.data?.meals ?? []).map((m) => m.id),
        workoutAfterMealId: after >= 0 ? ids[after] : null,
        meals: diet.meals.map((m, i) => ({
          id: ids[i],
          name: m.name,
          kcal: meals[i].kcal,
          proteinG: meals[i].proteinG,
          carbsG: meals[i].carbsG,
          fatG: meals[i].fatG,
          description: m.description,
          isMain: m.isMain,
        })),
      });
    await updateProfile.mutateAsync({ diet_mode: diet.mode });
    result.dietApplied = true;
  }

  async function applyWorkout(workout: ImportedWorkout, result: ApplyResult) {
    const supabase = getSupabase();
    const { ids, created } = await resolveExercises(workout, userId!);
    result.createdExercises = created;
    const days = workout.days
      .map((d) => ({
        name: d.name,
        exercises: d.exercises.flatMap((e) => {
          const exerciseId = ids.get(normalizeName(e.name));
          if (!exerciseId) {
            result.skippedExercises.push(e.name);
            return [];
          }
          return [{ ...e, exerciseId }];
        }),
      }))
      .filter((d) => d.exercises.length > 0);
    if (days.length === 0) throw new Error('None of the exercises could be matched.');

    const existing: PlanView | undefined = workout.id
      ? plans.data?.find((p) => p.id === workout.id)
      : undefined;

    let planId: string;
    let oldDays: { id: string }[] = [];
    if (existing) {
      // Backup first: the plan as it was, archived, so the change can always be undone.
      const backupId = await duplicate.mutateAsync({
        plan: existing,
        name: `${existing.name} (before AI)`,
      });
      await supabase.from('workout_plans').update({ status: 'archived' }).eq('id', backupId);
      const renamed = await supabase
        .from('workout_plans')
        .update({ name: workout.name })
        .eq('id', existing.id);
      if (renamed.error) throw renamed.error;
      planId = existing.id;
      oldDays = existing.days;
      result.workoutUpdated = true;
      result.backupName = `${existing.name} (before AI)`;
    } else {
      // The first plan is the one you train with.
      const active = await supabase
        .from('workout_plans')
        .select('id')
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(1);
      if (active.error) throw active.error;
      planId = newId();
      const { error } = await supabase.from('workout_plans').insert({
        id: planId,
        user_id: userId!,
        name: workout.name,
        status: active.data.length === 0 ? 'active' : 'draft',
        source: 'ai',
      });
      if (error) throw error;
    }

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const reuse = oldDays[i];
      const dayId = reuse?.id ?? newId();
      const dayRow = {
        id: dayId,
        user_id: userId!,
        plan_id: planId,
        position: i,
        name: day.name,
        deleted_at: null,
      };
      const dayRes = await supabase.from('plan_days').upsert(dayRow);
      if (dayRes.error) throw dayRes.error;
      if (reuse) {
        const gone = await supabase
          .from('plan_exercises')
          .update({ deleted_at: new Date().toISOString() })
          .eq('plan_day_id', dayId)
          .is('deleted_at', null);
        if (gone.error) throw gone.error;
      }
      const rows = day.exercises.map((e, position) => ({
        id: newId(),
        user_id: userId!,
        plan_day_id: dayId,
        exercise_id: e.exerciseId,
        position,
        target_sets: e.sets,
        target_reps: e.reps,
        rest_s: e.restS,
        notes: e.notes || null,
        superset_with_next: e.supersetWithNext && position < day.exercises.length - 1,
      }));
      const exRes = await supabase.from('plan_exercises').insert(rows);
      if (exRes.error) throw exRes.error;
    }
    // Days the new version no longer has.
    for (const old of oldDays.slice(days.length)) {
      await supabase
        .from('plan_days')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', old.id);
    }
    result.workoutPlanId = planId;
  }
}

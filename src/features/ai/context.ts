import { ageInYears } from '@/domain/nutrition';
import type { ImportedDiet, ImportedWorkout } from '@/domain/plan-import';
import { useGoalForDay } from '@/features/diet/log';
import { useFixedPlan, type FixedPlan } from '@/features/diet/fixed';
import { useLatestWeight, useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { useExercises } from '@/features/train/exercises';
import { usePlans, type PlanView } from '@/features/train/plans';
import type { Goal } from '@/domain/diet';

/** A plan in the exchange format (what the AI is shown, and what it gives back). */
export function exportWorkoutPlan(plan: PlanView) {
  return {
    id: plan.id,
    name: plan.name,
    days: plan.days.map((d) => ({
      name: d.name,
      exercises: d.exercises.map((e) => ({
        exercise: e.exercise.name,
        sets: e.targetSets,
        reps: e.targetReps,
        rest_s: e.restS,
        notes: e.notes ?? '',
        ...(e.supersetWithNext ? { superset_with_next: true } : {}),
        ...(e.drops ? { drops: e.drops } : {}),
      })),
    })),
  };
}

export function exportDiet(goal: Goal | null, plan: FixedPlan | null, mode: string | null) {
  if (!goal) return null;
  const workoutAfter = plan?.meals.find((m) => m.id === plan.workoutAfterMealId)?.name;
  return {
    mode: mode === 'tracking' ? 'tracking' : 'fixed_meals',
    daily: { kcal: goal.kcal, protein_g: goal.proteinG, carbs_g: goal.carbsG, fat_g: goal.fatG },
    meals: (plan?.meals ?? []).map((m) => ({
      name: m.name,
      main: m.isMain,
      description: m.description,
      kcal: m.kcal,
      protein_g: m.proteinG,
      carbs_g: m.carbsG,
      fat_g: m.fatG,
    })),
    ...(workoutAfter ? { workout_after: workoutAfter } : {}),
  };
}

/**
 * What an AI is told about the user: goal, body and training basics (never the name or the birth
 * date), the plans they have now and the exercises it may use.
 */
export function useAiContext() {
  const profile = useProfile();
  const today = useToday();
  const goal = useGoalForDay(today);
  const weight = useLatestWeight();
  const plans = usePlans();
  const fixed = useFixedPlan();
  const exercises = useExercises();

  const p = profile.data;
  const parts = [
    p?.goal ? `goal ${p.goal.replace('_', ' ')}` : null,
    p?.sex ? `sex ${p.sex}` : null,
    p?.birth_date ? `age ${ageInYears(new Date(p.birth_date), new Date())}` : null,
    p?.height_cm ? `height ${p.height_cm} cm` : null,
    weight.data ? `weight ${weight.data.weightKg} kg` : null,
    p?.activity_level ? `daily activity ${p.activity_level}` : null,
    p?.experience ? `training experience ${p.experience}` : null,
    p?.training_location ? `trains at: ${p.training_location}` : null,
    goal ? `current target ${goal.kcal} kcal` : null,
    goal?.maintenanceKcal ? `maintenance ${goal.maintenanceKcal} kcal` : null,
  ].filter(Boolean);

  const workoutPlans = (plans.data ?? [])
    .filter((x) => x.status !== 'archived')
    .map(exportWorkoutPlan);
  return {
    ready: !profile.isPending && !plans.isPending && !exercises.isPending,
    profileText: parts.length ? parts.join(', ') : 'not given',
    current: {
      workout_plans: workoutPlans,
      diet_plan: exportDiet(goal, fixed.data ?? null, p?.diet_mode ?? null),
    },
    exerciseNames: (exercises.data ?? []).map((e) => e.name),
  };
}

export type { ImportedDiet, ImportedWorkout };

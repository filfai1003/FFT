import { ageInYears } from '@/domain/nutrition';
import type { ImportedDiet, ImportedWorkout } from '@/domain/plan-import';
import { useGoalForDay } from '@/features/diet/log';
import { useFixedPlan, type FixedPlan } from '@/features/diet/fixed';
import { useLatestWeight, useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { useExercises } from '@/features/train/exercises';
import { usePlans, type PlanView } from '@/features/train/plans';
import type { Goal } from '@/domain/diet';
import type { AiAccess } from './access';

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
    // null = no calorie target set (DECISIONS 104).
    daily:
      goal.kcal != null
        ? { kcal: goal.kcal, protein_g: goal.proteinG, carbs_g: goal.carbsG, fat_g: goal.fatG }
        : null,
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

export type ProfileFacts = {
  goal?: string | null;
  sex?: string | null;
  birthDate?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activity?: string | null;
  experience?: string | null;
  location?: string | null;
  targetKcal?: number | null;
  maintenanceKcal?: number | null;
  /** The user chose to have no calorie target (DECISIONS 104). */
  noTarget?: boolean;
};

/**
 * The one-line profile an AI is told. Never the name, the email or the birth date: the age in
 * whole years only. With `access` (the coach), only what the user shared: profile and body facts
 * need "profile", calorie targets need "diet" (DECISIONS 66).
 */
export function profileLine(
  f: ProfileFacts,
  access: Pick<AiAccess, 'profile' | 'diet'> = { profile: true, diet: true },
  now: Date = new Date(),
): string {
  const body = access.profile;
  const diet = access.diet;
  const parts = [
    body && f.goal ? `goal ${f.goal.replace('_', ' ')}` : null,
    body && f.sex ? `sex ${f.sex}` : null,
    body && f.birthDate ? `age ${ageInYears(new Date(f.birthDate), now)}` : null,
    body && f.heightCm ? `height ${f.heightCm} cm` : null,
    body && f.weightKg ? `weight ${f.weightKg} kg` : null,
    body && f.activity ? `daily activity ${f.activity}` : null,
    body && f.experience ? `training experience ${f.experience}` : null,
    body && f.location ? `trains at: ${f.location}` : null,
    diet && f.targetKcal ? `current target ${f.targetKcal} kcal` : null,
    diet && !f.targetKcal && f.noTarget ? 'no calorie target set' : null,
    diet && f.maintenanceKcal ? `maintenance ${f.maintenanceKcal} kcal` : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return body || diet ? 'not given' : 'not shared by the user';
}

/**
 * What an AI is told about the user: goal, body and training basics (never the name or the birth
 * date), the plans they have now and the exercises it may use. `profileText` is the full line
 * (manual mode: the user copies it themselves); the coach uses `profileFor(access)`.
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
  const facts: ProfileFacts = {
    goal: p?.goal,
    sex: p?.sex,
    birthDate: p?.birth_date,
    heightCm: p?.height_cm,
    weightKg: weight.data?.weightKg,
    activity: p?.activity_level,
    experience: p?.experience,
    location: p?.training_location,
    targetKcal: goal?.kcal,
    maintenanceKcal: goal?.maintenanceKcal,
    noTarget: goal != null && goal.kcal == null,
  };

  const workoutPlans = (plans.data ?? [])
    .filter((x) => x.status !== 'archived')
    .map(exportWorkoutPlan);
  return {
    ready: !profile.isPending && !plans.isPending && !exercises.isPending,
    profileText: profileLine(facts),
    profileFor: (access: AiAccess) => profileLine(facts, access),
    current: {
      workout_plans: workoutPlans,
      diet_plan: exportDiet(goal, fixed.data ?? null, p?.diet_mode ?? null),
    },
    exerciseNames: (exercises.data ?? []).map((e) => e.name),
  };
}

export type { ImportedDiet, ImportedWorkout };

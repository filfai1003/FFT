import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FixedCheck } from '@/domain/diet';
import { useSessionStore as useAuth } from '@/features/auth/session-store';
import { getSupabase } from '@/lib/supabase';
import { newId } from '@/lib/uuid';
import { dietKeys } from './log';

export type FixedMeal = {
  id: string;
  position: number;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  description: string;
  isMain: boolean;
};

export type FixedPlan = {
  id: string;
  name: string;
  meals: FixedMeal[];
  /** The workout sits right after this meal (null = not placed). */
  workoutAfterMealId: string | null;
};

type MealRow = {
  id: string;
  position: number;
  name: string;
  kcal: number;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
  description: string | null;
  is_main: boolean;
  deleted_at: string | null;
};

export const fixedKeys = {
  plan: ['diet', 'fixed-plan'] as const,
  checks: (day: string) => ['diet', 'fixed-checks', day] as const,
};

/** The active fixed-meals plan (or null). Also used outside React, by the AI assistant. */
export async function fetchFixedPlan(): Promise<FixedPlan | null> {
  const { data, error } = await getSupabase()
    .from('fixed_meal_plans')
    .select('id, name, workout_after_meal_id, fixed_meals(*)')
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const meals = ((data as unknown as { fixed_meals: MealRow[] }).fixed_meals ?? [])
    .filter((m) => m.deleted_at == null)
    .sort((a, b) => a.position - b.position)
    .map<FixedMeal>((m) => ({
      id: m.id,
      position: m.position,
      name: m.name,
      kcal: m.kcal,
      proteinG: Number(m.protein_g),
      carbsG: Number(m.carbs_g),
      fatG: Number(m.fat_g),
      description: m.description ?? '',
      isMain: m.is_main,
    }));
  return {
    id: data.id,
    name: data.name,
    meals,
    workoutAfterMealId: data.workout_after_meal_id,
  };
}

export function useFixedPlan() {
  return useQuery({ queryKey: fixedKeys.plan, queryFn: fetchFixedPlan });
}

export type StoredCheck = FixedCheck & { id: string };

type CheckRow = {
  id: string;
  fixed_meal_id: string;
  status: string;
  kcal: number;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
};

export async function fetchFixedChecks(day: string): Promise<StoredCheck[]> {
  const { data, error } = await getSupabase()
    .from('fixed_meal_checks')
    .select('*')
    .eq('day', day)
    .is('deleted_at', null);
  if (error) throw error;
  return (data as unknown as CheckRow[]).map<StoredCheck>((c) => ({
    id: c.id,
    fixedMealId: c.fixed_meal_id,
    status: c.status as FixedCheck['status'],
    kcal: c.kcal,
    proteinG: Number(c.protein_g),
    carbsG: Number(c.carbs_g),
    fatG: Number(c.fat_g),
  }));
}

export function useFixedChecks(day: string) {
  return useQuery({ queryKey: fixedKeys.checks(day), queryFn: () => fetchFixedChecks(day) });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: dietKeys.all });
}

export type SetCheckArgs = {
  day: string;
  mealId: string;
  check: Omit<FixedCheck, 'fixedMealId'> | null;
};

/**
 * Sets (or clears) the check of one meal for one day. One check per meal per day: an existing one
 * is updated, a new one inserted. `null` removes it (UNDO of a tick). Also used by the widgets.
 */
export async function setFixedCheck(userId: string, args: SetCheckArgs) {
  const supabase = getSupabase();
  const existing = await supabase
    .from('fixed_meal_checks')
    .select('id')
    .eq('day', args.day)
    .eq('fixed_meal_id', args.mealId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (!args.check) {
    if (existing.data) {
      const { error } = await supabase
        .from('fixed_meal_checks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', existing.data.id);
      if (error) throw error;
    }
    return;
  }
  const row = {
    status: args.check.status,
    kcal: args.check.kcal,
    protein_g: args.check.proteinG,
    carbs_g: args.check.carbsG,
    fat_g: args.check.fatG,
    checked_at: new Date().toISOString(),
  };
  const { error } = existing.data
    ? await supabase.from('fixed_meal_checks').update(row).eq('id', existing.data.id)
    : await supabase.from('fixed_meal_checks').insert({
        id: newId(),
        user_id: userId,
        day: args.day,
        fixed_meal_id: args.mealId,
        ...row,
      });
  if (error) throw error;
}

export function useSetCheck() {
  const userId = useAuth((s) => s.userId);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (args: SetCheckArgs) => setFixedCheck(userId!, args),
    onSuccess: invalidate,
  });
}

export type MealDraft = Omit<FixedMeal, 'position'> & { position?: number };

/** Saves the plan: name, meals (in order) and soft-deletes the meals that were removed. */
export function useSaveFixedPlan() {
  const userId = useAuth((s) => s.userId);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (args: {
      planId: string | null;
      name: string;
      meals: MealDraft[];
      removedIds: string[];
      workoutAfterMealId?: string | null;
    }) => {
      const supabase = getSupabase();
      const planId = args.planId ?? newId();
      const plan = await supabase.from('fixed_meal_plans').upsert({
        id: planId,
        user_id: userId!,
        name: args.name.trim(),
        active: true,
        workout_after_meal_id: args.workoutAfterMealId ?? null,
        deleted_at: null,
      });
      if (plan.error) throw plan.error;
      if (args.meals.length > 0) {
        const res = await supabase.from('fixed_meals').upsert(
          args.meals.map((m, position) => ({
            id: m.id,
            user_id: userId!,
            plan_id: planId,
            position,
            name: m.name.trim(),
            kcal: m.kcal,
            protein_g: m.proteinG,
            carbs_g: m.carbsG,
            fat_g: m.fatG,
            description: m.description.trim() || null,
            is_main: m.isMain,
            deleted_at: null,
          })),
        );
        if (res.error) throw res.error;
      }
      if (args.removedIds.length > 0) {
        const res = await supabase
          .from('fixed_meals')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', args.removedIds);
        if (res.error) throw res.error;
      }
    },
    onSuccess: invalidate,
  });
}

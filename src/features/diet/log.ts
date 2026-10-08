import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { goalForDay, type Goal, type Macros, type Meal } from '@/domain/diet';
import { addDays, deviceTimeZone, localDay } from '@/domain/day';
import { useSessionStore as useAuth } from '@/features/auth/session-store';
import { useProfile } from '@/features/profile/api';
import { getSupabase } from '@/lib/supabase';
import { newId, stableId } from '@/lib/uuid';

export const dietKeys = {
  day: (day: string) => ['diet', 'day', day] as const,
  totals: (day: string) => ['diet', 'totals', day] as const,
  goals: ['diet', 'goals'] as const,
  water: (day: string) => ['diet', 'water', day] as const,
  trained: (from: string, to: string) => ['diet', 'trained', from, to] as const,
  all: ['diet'] as const,
};

export type LogEntry = {
  id: string;
  day: string;
  meal: Meal;
  foodId: string | null;
  recipeId: string | null;
  name: string;
  quantityLabel: string | null;
  grams: number | null;
  servings: number | null;
  macros: Macros;
};

type LogRow = {
  id: string;
  day: string;
  meal: string;
  food_id: string | null;
  recipe_id: string | null;
  name: string;
  quantity_label: string | null;
  grams: number | string | null;
  servings: number | string | null;
  kcal: number | string;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
};

export function toLogEntry(r: LogRow): LogEntry {
  return {
    id: r.id,
    day: r.day,
    meal: r.meal as Meal,
    foodId: r.food_id,
    recipeId: r.recipe_id,
    name: r.name,
    quantityLabel: r.quantity_label,
    grams: r.grams != null ? Number(r.grams) : null,
    servings: r.servings != null ? Number(r.servings) : null,
    macros: {
      kcal: Number(r.kcal),
      protein: Number(r.protein_g),
      carbs: Number(r.carbs_g),
      fat: Number(r.fat_g),
    },
  };
}

export function useDayLog(day: string) {
  return useQuery({
    queryKey: dietKeys.day(day),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('food_logs')
        .select('*')
        .eq('day', day)
        .is('deleted_at', null)
        .order('created_at');
      if (error) throw error;
      return (data as unknown as LogRow[]).map(toLogEntry);
    },
  });
}

/** Today / diary / charts read the day's calories and macros ONLY from this view. */
export function useDayTotals(day: string) {
  return useQuery({
    queryKey: dietKeys.totals(day),
    queryFn: async (): Promise<Macros> => {
      const { data, error } = await getSupabase()
        .from('daily_nutrition_totals')
        .select('kcal, protein_g, carbs_g, fat_g')
        .eq('day', day)
        .maybeSingle();
      if (error) throw error;
      return {
        kcal: Number(data?.kcal ?? 0),
        protein: Number(data?.protein_g ?? 0),
        carbs: Number(data?.carbs_g ?? 0),
        fat: Number(data?.fat_g ?? 0),
      };
    },
  });
}

type GoalRow = {
  valid_from: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  training_day_bonus_kcal: number;
  water_ml: number;
  maintenance_kcal: number | null;
};

export type GoalWithMaintenance = Goal & { maintenanceKcal: number | null };

function toGoal(r: GoalRow): GoalWithMaintenance {
  return {
    validFrom: r.valid_from,
    kcal: r.kcal,
    proteinG: r.protein_g,
    carbsG: r.carbs_g,
    fatG: r.fat_g,
    trainingDayBonusKcal: r.training_day_bonus_kcal,
    waterMl: r.water_ml,
    maintenanceKcal: r.maintenance_kcal,
  };
}

export function useGoals() {
  return useQuery({
    queryKey: dietKeys.goals,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('nutrition_goals')
        .select('*')
        .is('deleted_at', null)
        .order('valid_from', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as GoalRow[]).map(toGoal);
    },
  });
}

export function useGoalForDay(day: string): GoalWithMaintenance | null {
  const goals = useGoals();
  return goalForDay(goals.data ?? [], day);
}

/** Days (YYYY-MM-DD) in [from, to] with a finished workout, in the profile time zone. */
export function useTrainedDays(from: string, to: string) {
  const tz = useProfile().data?.timezone ?? deviceTimeZone();
  return useQuery({
    queryKey: dietKeys.trained(from, to),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('workout_sessions')
        .select('started_at')
        .eq('status', 'done')
        .is('deleted_at', null)
        .gte('started_at', new Date(`${addDays(from, -1)}T00:00:00Z`).toISOString())
        .lte('started_at', new Date(`${addDays(to, 2)}T00:00:00Z`).toISOString());
      if (error) throw error;
      return new Set(
        (data as { started_at: string }[]).map((s) => localDay(new Date(s.started_at), tz)),
      );
    },
  });
}

function useUserId() {
  return useAuth((s) => s.userId);
}

function useInvalidateDiet() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: dietKeys.all });
}

export type NewLog = {
  id?: string;
  day: string;
  meal: Meal;
  foodId?: string | null;
  recipeId?: string | null;
  name: string;
  quantityLabel?: string | null;
  grams?: number | null;
  servings?: number | null;
  macros: Macros;
};

export function useLogFood() {
  const userId = useUserId();
  const invalidate = useInvalidateDiet();
  return useMutation({
    mutationFn: async (e: NewLog) => {
      const id = e.id ?? newId();
      const { error } = await getSupabase()
        .from('food_logs')
        .upsert({
          id,
          user_id: userId!,
          day: e.day,
          meal: e.meal,
          food_id: e.foodId ?? null,
          recipe_id: e.recipeId ?? null,
          name: e.name,
          quantity_label: e.quantityLabel ?? null,
          grams: e.grams ?? null,
          servings: e.servings ?? null,
          kcal: e.macros.kcal,
          protein_g: e.macros.protein,
          carbs_g: e.macros.carbs,
          fat_g: e.macros.fat,
          deleted_at: null,
        });
      if (error) throw error;
      return id;
    },
    onSuccess: invalidate,
  });
}

/** Soft delete (and restore, for UNDO). */
export function useSetLogDeleted() {
  const invalidate = useInvalidateDiet();
  return useMutation({
    mutationFn: async ({ id, deleted }: { id: string; deleted: boolean }) => {
      const { error } = await getSupabase()
        .from('food_logs')
        .update({ deleted_at: deleted ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useWater(day: string) {
  return useQuery({
    queryKey: dietKeys.water(day),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('water_logs')
        .select('id, ml')
        .eq('day', day)
        .is('deleted_at', null)
        .order('created_at');
      if (error) throw error;
      const rows = data as { id: string; ml: number }[];
      return { totalMl: rows.reduce((a, r) => a + r.ml, 0), rows };
    },
  });
}

export function useAddWater() {
  const userId = useUserId();
  const invalidate = useInvalidateDiet();
  return useMutation({
    mutationFn: async ({ day, ml, id }: { day: string; ml: number; id?: string }) => {
      const rowId = id ?? newId();
      const { error } = await getSupabase()
        .from('water_logs')
        .upsert({ id: rowId, user_id: userId!, day, ml, deleted_at: null });
      if (error) throw error;
      return rowId;
    },
    onSuccess: invalidate,
  });
}

export function useRemoveWater() {
  const invalidate = useInvalidateDiet();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase()
        .from('water_logs')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** New calorie/macro goal from today on (history is kept: one row per start date). */
export function useSaveGoal() {
  const userId = useUserId();
  const invalidate = useInvalidateDiet();
  return useMutation({
    mutationFn: async (g: {
      validFrom: string;
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      trainingDayBonusKcal: number;
      maintenanceKcal: number | null;
      waterMl: number;
    }) => {
      const id = await stableId(userId!, `goal-${g.validFrom}`);
      const { error } = await getSupabase().from('nutrition_goals').upsert({
        id,
        user_id: userId!,
        valid_from: g.validFrom,
        kcal: g.kcal,
        protein_g: g.proteinG,
        carbs_g: g.carbsG,
        fat_g: g.fatG,
        training_day_bonus_kcal: g.trainingDayBonusKcal,
        maintenance_kcal: g.maintenanceKcal,
        water_ml: g.waterMl,
        deleted_at: null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

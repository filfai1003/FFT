import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { goalForDay, type Goal, type Macros, type Meal } from '@/domain/diet';
import { addDays, deviceTimeZone, localDay } from '@/domain/day';
import { DEFAULT_WATER_ML, isWaterAutomatic } from '@/domain/hydration';
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
  name: string;
  quantityLabel: string | null;
  grams: number | null;
  macros: Macros;
};

type LogRow = {
  id: string;
  day: string;
  meal: string;
  food_id: string | null;
  name: string;
  quantity_label: string | null;
  grams: number | string | null;
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
    name: r.name,
    quantityLabel: r.quantity_label,
    grams: r.grams != null ? Number(r.grams) : null,
    macros: {
      kcal: Number(r.kcal),
      protein: Number(r.protein_g),
      carbs: Number(r.carbs_g),
      fat: Number(r.fat_g),
    },
  };
}

/** The food entries of a day, in the order they were logged (also read by the home screen widgets). */
export async function fetchDayLog(day: string): Promise<LogEntry[]> {
  const { data, error } = await getSupabase()
    .from('food_logs')
    .select('*')
    .eq('day', day)
    .is('deleted_at', null)
    .order('created_at');
  if (error) throw error;
  return (data as unknown as LogRow[]).map(toLogEntry);
}

export function useDayLog(day: string) {
  return useQuery({ queryKey: dietKeys.day(day), queryFn: () => fetchDayLog(day) });
}

/** Today / diary / charts / widgets read the day's calories and macros ONLY from this view. */
export async function fetchDayTotals(day: string): Promise<Macros> {
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
}

export function useDayTotals(day: string) {
  return useQuery({ queryKey: dietKeys.totals(day), queryFn: () => fetchDayTotals(day) });
}

type GoalRow = {
  id: string;
  valid_from: string;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  training_day_bonus_kcal: number;
  water_ml: number;
  water_auto: boolean | null;
  maintenance_kcal: number | null;
};

export type GoalWithMaintenance = Goal & { id: string; maintenanceKcal: number | null };

const numOrNull = (v: number | string | null) => (v == null ? null : Number(v));

function toGoal(r: GoalRow): GoalWithMaintenance {
  return {
    id: r.id,
    validFrom: r.valid_from,
    kcal: numOrNull(r.kcal),
    proteinG: numOrNull(r.protein_g),
    carbsG: numOrNull(r.carbs_g),
    fatG: numOrNull(r.fat_g),
    trainingDayBonusKcal: r.training_day_bonus_kcal,
    waterMl: r.water_ml,
    waterAuto: isWaterAutomatic(r),
    maintenanceKcal: r.maintenance_kcal,
  };
}

export async function fetchGoals() {
  const { data, error } = await getSupabase()
    .from('nutrition_goals')
    .select('*')
    .is('deleted_at', null)
    .order('valid_from', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as GoalRow[]).map(toGoal);
}

export function useGoals() {
  return useQuery({ queryKey: dietKeys.goals, queryFn: fetchGoals });
}

export function useGoalForDay(day: string): GoalWithMaintenance | null {
  const goals = useGoals();
  return goalForDay(goals.data ?? [], day);
}

/** Days (YYYY-MM-DD) in [from, to] with a finished workout, in the profile time zone. */
export async function fetchTrainedDays(from: string, to: string, tz: string) {
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
}

export function useTrainedDays(from: string, to: string) {
  const tz = useProfile().data?.timezone ?? deviceTimeZone();
  return useQuery({
    queryKey: dietKeys.trained(from, to),
    queryFn: () => fetchTrainedDays(from, to, tz),
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
  name: string;
  quantityLabel?: string | null;
  grams?: number | null;
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
          name: e.name,
          quantity_label: e.quantityLabel ?? null,
          grams: e.grams ?? null,
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

/**
 * "Same as yesterday": copies entries (another day's meal) into a day and meal as new entries,
 * values as they were logged. Returns the new ids (for UNDO).
 */
export async function copyEntries(
  userId: string,
  { entries, day, meal }: { entries: LogEntry[]; day: string; meal: Meal },
): Promise<string[]> {
  const rows = entries.map((e) => ({
    id: newId(),
    user_id: userId,
    day,
    meal,
    food_id: e.foodId,
    name: e.name,
    quantity_label: e.quantityLabel,
    grams: e.grams,
    kcal: e.macros.kcal,
    protein_g: e.macros.protein,
    carbs_g: e.macros.carbs,
    fat_g: e.macros.fat,
    deleted_at: null,
  }));
  const { error } = await getSupabase().from('food_logs').upsert(rows);
  if (error) throw error;
  return rows.map((r) => r.id);
}

export function useCopyEntries() {
  const userId = useUserId();
  const invalidate = useInvalidateDiet();
  return useMutation({
    mutationFn: (args: { entries: LogEntry[]; day: string; meal: Meal }) =>
      copyEntries(userId!, args),
    onSuccess: invalidate,
  });
}

/** Soft delete of a food entry (and restore, for UNDO). */
export async function setLogDeleted(id: string, deleted: boolean) {
  const { error } = await getSupabase()
    .from('food_logs')
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

/** Soft delete (and restore, for UNDO). */
export function useSetLogDeleted() {
  const invalidate = useInvalidateDiet();
  return useMutation({
    mutationFn: ({ id, deleted }: { id: string; deleted: boolean }) => setLogDeleted(id, deleted),
    onSuccess: invalidate,
  });
}

export async function fetchWater(day: string) {
  const { data, error } = await getSupabase()
    .from('water_logs')
    .select('id, ml')
    .eq('day', day)
    .is('deleted_at', null)
    .order('created_at');
  if (error) throw error;
  const rows = data as { id: string; ml: number }[];
  return { totalMl: rows.reduce((a, r) => a + r.ml, 0), rows };
}

export function useWater(day: string) {
  return useQuery({ queryKey: dietKeys.water(day), queryFn: () => fetchWater(day) });
}

/** Adds water to a day. Returns the row id (for UNDO). */
export async function addWater(
  userId: string,
  { day, ml, id }: { day: string; ml: number; id?: string },
): Promise<string> {
  const rowId = id ?? newId();
  const { error } = await getSupabase()
    .from('water_logs')
    .upsert({ id: rowId, user_id: userId, day, ml, deleted_at: null });
  if (error) throw error;
  return rowId;
}

export function useAddWater() {
  const userId = useUserId();
  const invalidate = useInvalidateDiet();
  return useMutation({
    mutationFn: (args: { day: string; ml: number; id?: string }) => addWater(userId!, args),
    onSuccess: invalidate,
  });
}

export async function removeWater(id: string) {
  const { error } = await getSupabase()
    .from('water_logs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export function useRemoveWater() {
  const invalidate = useInvalidateDiet();
  return useMutation({ mutationFn: removeWater, onSuccess: invalidate });
}

/** What a goal row holds. kcal and macros null = "no target" from `validFrom` on (DECISIONS 104). */
export type GoalInput = {
  validFrom: string;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  trainingDayBonusKcal: number;
  maintenanceKcal: number | null;
  waterMl: number;
  waterAuto: boolean;
};

/** Writes the goal row of a start day (history is kept: one row per start date). */
export async function saveGoalRow(userId: string, g: GoalInput) {
  const target = g.kcal != null;
  const id = await stableId(userId, `goal-${g.validFrom}`);
  const { error } = await getSupabase()
    .from('nutrition_goals')
    .upsert({
      id,
      user_id: userId,
      valid_from: g.validFrom,
      kcal: g.kcal,
      protein_g: target ? g.proteinG : null,
      carbs_g: target ? g.carbsG : null,
      fat_g: target ? g.fatG : null,
      // No target: nothing derived from one either (the database refuses it).
      training_day_bonus_kcal: target ? g.trainingDayBonusKcal : 0,
      maintenance_kcal: target ? g.maintenanceKcal : null,
      water_ml: g.waterMl,
      water_auto: g.waterAuto,
      deleted_at: null,
    });
  if (error) throw error;
}

/**
 * Changes only the water target from `day` on (automatic, or the user's own number), keeping the
 * calorie target in force that day as it is. Without any goal row the new row has no calorie
 * target, which reads the same as no row at all (DECISIONS 104).
 */
export async function saveWaterTarget(
  userId: string,
  day: string,
  current: GoalWithMaintenance | null,
  water: { auto: boolean; ml: number },
) {
  await saveGoalRow(userId, {
    validFrom: day,
    kcal: current?.kcal ?? null,
    proteinG: current?.proteinG ?? null,
    carbsG: current?.carbsG ?? null,
    fatG: current?.fatG ?? null,
    trainingDayBonusKcal: current?.trainingDayBonusKcal ?? 0,
    maintenanceKcal: current?.maintenanceKcal ?? null,
    waterMl: water.ml,
    waterAuto: water.auto,
  });
}

/** Changes only the water target from a day on (see `saveWaterTarget`). */
export function useSaveWaterTarget() {
  const userId = useUserId();
  const invalidate = useInvalidateDiet();
  return useMutation({
    mutationFn: (v: {
      day: string;
      current: GoalWithMaintenance | null;
      water: { auto: boolean; ml: number };
    }) => saveWaterTarget(userId!, v.day, v.current, v.water),
    onSuccess: invalidate,
  });
}

/** New calorie/macro goal (or "no target") from a day on. */
export function useSaveGoal() {
  const userId = useUserId();
  const invalidate = useInvalidateDiet();
  return useMutation({
    mutationFn: (g: GoalInput) => saveGoalRow(userId!, g),
    onSuccess: invalidate,
  });
}

/**
 * "No target" from `day` on (the water goal is kept). Returns the UNDO: it puts back the row of
 * that day as it was, or removes the new one. Null when there was no target already.
 */
export async function removeTarget(
  userId: string,
  day: string,
  current: GoalWithMaintenance | null,
): Promise<(() => Promise<void>) | null> {
  if (current && current.kcal == null) return null;
  await saveGoalRow(userId, {
    validFrom: day,
    kcal: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    trainingDayBonusKcal: 0,
    maintenanceKcal: null,
    waterMl: current?.waterMl ?? DEFAULT_WATER_ML,
    waterAuto: current?.waterAuto ?? true,
  });
  if (current && current.validFrom === day) return () => saveGoalRow(userId, current);
  const id = await stableId(userId, `goal-${day}`);
  return async () => {
    const { error } = await getSupabase()
      .from('nutrition_goals')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  };
}

/** "No target" from a day on; resolves to the UNDO (which refreshes the diet data too), or null. */
export function useRemoveTarget() {
  const userId = useUserId();
  const invalidate = useInvalidateDiet();
  return useMutation({
    mutationFn: async ({ day, current }: { day: string; current: GoalWithMaintenance | null }) => {
      const undo = await removeTarget(userId!, day, current);
      return undo
        ? async () => {
            await undo();
            await invalidate();
          }
        : null;
    },
    onSuccess: invalidate,
  });
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { addDays, deviceTimeZone, localDay, localHour } from '@/domain/day';
import { dietDayStatus, goalForDay, targetForDay } from '@/domain/diet';
import {
  computeGamification,
  type BadgePlan,
  type DietDay,
  type ExerciseDay,
  type Gamification,
  type GamificationInput,
  type WorkoutDay,
} from '@/domain/gamification';
import type { Muscle } from '@/domain/muscles';
import type { DailyE1rm } from '@/domain/progress';
import type { ExerciseMuscles } from '@/domain/volume';
import { fetchGoals } from '@/features/diet/log';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { waterTargetFromData } from '@/features/diet/water-target';
import { fetchVolumeSets } from '@/features/progress/balance';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { usePlanStore } from '@/lib/plan';
import { getSupabase } from '@/lib/supabase';

/** Everything the streak, XP, records, badges and community scores are computed from. */
export type Activity = Omit<GamificationInput, 'today' | 'workouts' | 'weekStart' | 'plan'> & {
  workouts: (WorkoutDay & { planId: string | null })[];
  /** Per exercise and day (main sets): the strength score's input. */
  daily: DailyE1rm[];
};

export const gamificationKey = ['profile', 'gamification'] as const;

type Rows = { data: unknown; error: unknown };
const rowsOf = <T>(r: Rows): T[] => {
  if (r.error) throw r.error;
  return (r.data ?? []) as T[];
};
const num = (v: unknown) => (v == null ? null : Number(v));

/** Reads the device's own database (never the server): a few queries over the user's history. */
export async function fetchActivity(tz: string): Promise<Activity> {
  const db = getSupabase();
  const [
    food,
    checks,
    body,
    sessions,
    sets,
    totals,
    daily,
    goals,
    supps,
    suppLogs,
    water,
    profile,
    volumeSets,
    exercises,
  ] = await Promise.all([
    db.from('food_logs').select('day').is('deleted_at', null),
    db.from('fixed_meal_checks').select('day, status').is('deleted_at', null),
    db.from('body_metrics').select('day, weight_kg, created_at').is('deleted_at', null),
    db
      .from('workout_sessions')
      .select('id, plan_id, started_at, ended_at')
      .eq('status', 'done')
      .is('deleted_at', null),
    db.from('session_sets').select('session_id, completed_at').is('deleted_at', null),
    db.from('daily_nutrition_totals').select('day, kcal, protein_g, carbs_g, fat_g'),
    db
      .from('exercise_e1rm_daily')
      .select('exercise_id, day, best_e1rm_kg, best_weight_kg, sets, volume_kg'),
    fetchGoals(),
    // Deleted supplements too: a day only asks for the supplements the user had on that day.
    db.from('supplements').select('id, created_at, deleted_at'),
    db.from('supplement_logs').select('day, supplement_id').is('deleted_at', null),
    db.from('water_logs').select('day, ml').is('deleted_at', null),
    db.from('profiles').select('created_at, birth_date, sex, height_cm'),
    // Every completed set ever (balanced weeks, DECISIONS 126): the training balance's reading.
    fetchVolumeSets('1970-01-01', tz),
    db.from('exercises').select('id, primary_muscle, secondary_muscles, indirect_muscles'),
  ]);
  const today = localDay(new Date(), tz);

  // A finished workout counts only with at least one completed set.
  const withSets = new Set(
    rowsOf<{ session_id: string; completed_at: string | null }>(sets as Rows)
      .filter((s) => s.completed_at != null)
      .map((s) => s.session_id),
  );
  const workouts = rowsOf<{ id: string; plan_id: string | null; started_at: string }>(
    sessions as Rows,
  )
    .filter((s) => withSets.has(s.id))
    .map((s) => {
      const at = new Date(s.started_at);
      return { id: s.id, planId: s.plan_id, day: localDay(at, tz), hour: localHour(at, tz) };
    });

  const checkInDays = new Set(rowsOf<{ day: string }>(body as Rows).map((r) => r.day));
  // Diet days logged: any food, or a fixed meal done or adjusted.
  const dietLoggedDays = new Set<string>();
  for (const r of rowsOf<{ day: string }>(food as Rows)) dietLoggedDays.add(r.day);
  for (const r of rowsOf<{ day: string; status: string }>(checks as Rows))
    if (r.status === 'done' || r.status === 'adjusted') dietLoggedDays.add(r.day);
  const loggedDays = new Set<string>([...checkInDays, ...dietLoggedDays]);
  for (const w of workouts) loggedDays.add(w.day);

  // Diet on target: within 10 % of that day's target (training-day bonus included). Days without
  // a target (DECISIONS 104) never count. The same days, with the eaten macros and the target,
  // feed the "diet respected" rule (126).
  const trained = new Set(workouts.map((w) => w.day));
  const dietOnTargetDays = new Set<string>();
  const dietDays: DietDay[] = [];
  type TotalsRow = {
    day: string;
    kcal: unknown;
    protein_g: unknown;
    carbs_g: unknown;
    fat_g: unknown;
  };
  for (const t of rowsOf<TotalsRow>(totals as Rows)) {
    const target = targetForDay(goalForDay(goals, t.day), trained.has(t.day));
    const eaten = {
      kcal: Number(t.kcal ?? 0),
      protein: Number(t.protein_g ?? 0),
      carbs: Number(t.carbs_g ?? 0),
      fat: Number(t.fat_g ?? 0),
    };
    if (eaten.kcal > 0) dietDays.push({ day: t.day, eaten, target });
    if (!target) continue;
    if (dietDayStatus(eaten.kcal, target.kcal) === 'onTarget') dietOnTargetDays.add(t.day);
  }

  // Supplements: a day counts when every supplement the user had that day was ticked.
  const supplementList = rowsOf<{ id: string; created_at: string; deleted_at: string | null }>(
    supps as Rows,
  ).map((r) => ({
    id: r.id,
    from: localDay(new Date(r.created_at), tz),
    until: r.deleted_at ? localDay(new Date(r.deleted_at), tz) : null,
  }));
  const takenByDay = new Map<string, Set<string>>();
  const supplementTicks: string[] = [];
  for (const r of rowsOf<{ day: string; supplement_id: string }>(suppLogs as Rows)) {
    takenByDay.set(r.day, (takenByDay.get(r.day) ?? new Set()).add(r.supplement_id));
    supplementTicks.push(r.day);
  }
  const supplementDays = new Set<string>();
  for (const [day, taken] of takenByDay) {
    const due = supplementList.filter((x) => x.from <= day && (x.until == null || x.until > day));
    if (due.length > 0 && due.every((x) => taken.has(x.id))) supplementDays.add(day);
  }
  // Days with at least one supplement to take (a day without any counts as met for medals).
  const supplementDueDays = new Set<string>();
  for (const x of supplementList)
    for (let d = x.from; d <= today && (x.until == null || d < x.until); d = addDays(d, 1))
      supplementDueDays.add(d);

  // Water: the day's glasses reach that day's goal.
  const waterByDay = new Map<string, number>();
  for (const r of rowsOf<{ day: string; ml: number | string }>(water as Rows))
    waterByDay.set(r.day, (waterByDay.get(r.day) ?? 0) + Number(r.ml));
  // The day's water target as everywhere else (DECISIONS 127): weight then, that day's workouts.
  const waterProfile =
    rowsOf<{ birth_date: string | null; sex: string | null; height_cm: number | string | null }>(
      profile as Rows,
    )[0] ?? null;
  const weights = rowsOf<{ day: string; weight_kg: number | string | null; created_at: string }>(
    body as Rows,
  )
    .filter((r) => r.weight_kg != null)
    .sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at));
  const weightOn = (day: string) => {
    let kg: number | null = null;
    for (const w of weights) if (w.day <= day) kg = Number(w.weight_kg);
    return kg;
  };
  const sessionsByDay = new Map<string, { startedAt: string; endedAt: string | null }[]>();
  for (const s of rowsOf<{ id: string; started_at: string; ended_at: string | null }>(
    sessions as Rows,
  )) {
    if (!withSets.has(s.id)) continue;
    const day = localDay(new Date(s.started_at), tz);
    sessionsByDay.set(day, [
      ...(sessionsByDay.get(day) ?? []),
      { startedAt: s.started_at, endedAt: s.ended_at },
    ]);
  }
  const waterGoalDays = new Set<string>();
  for (const [day, ml] of waterByDay) {
    const goalMl = waterTargetFromData({
      day,
      goals,
      profile: waterProfile,
      weightKg: weightOn(day),
      workouts: sessionsByDay.get(day) ?? [],
    }).ml;
    if (goalMl > 0 && ml >= goalMl) waterGoalDays.add(day);
  }

  // First day of use: the account's creation or the first logged row, whichever is earlier.
  // (A placeholder date of a profile seeded on the device, 1970, is not a creation day.)
  const starts = [
    ...rowsOf<{ created_at: string | null }>(profile as Rows)
      .filter((r) => r.created_at && r.created_at >= '2000')
      .map((r) => localDay(new Date(r.created_at!), tz)),
    ...loggedDays,
    ...supplementTicks,
    ...waterByDay.keys(),
  ].sort();
  const firstDay = starts[0] ?? null;

  type ExerciseRow = {
    id: string;
    primary_muscle: Muscle;
    secondary_muscles: Muscle[] | null;
    indirect_muscles: Muscle[] | null;
  };
  const exerciseMuscles = new Map<string, ExerciseMuscles>(
    rowsOf<ExerciseRow>(exercises as Rows).map((e): [string, ExerciseMuscles] => [
      e.id,
      {
        primary: e.primary_muscle,
        secondary: e.secondary_muscles ?? [],
        indirect: e.indirect_muscles ?? [],
      },
    ]),
  );

  type DailyRow = {
    exercise_id: string;
    day: string;
    best_e1rm_kg: unknown;
    best_weight_kg: unknown;
    sets: unknown;
    volume_kg: unknown;
  };
  const dailyRows = rowsOf<DailyRow>(daily as Rows).sort((a, b) => a.day.localeCompare(b.day));
  const exerciseDays: ExerciseDay[] = dailyRows.map((r) => ({
    exerciseId: r.exercise_id,
    day: r.day,
    bestWeightKg: num(r.best_weight_kg),
    bestE1rmKg: num(r.best_e1rm_kg),
  }));

  return {
    loggedDays,
    workouts,
    dietOnTargetDays,
    checkInDays,
    exerciseDays,
    dietLoggedDays,
    dietDays,
    supplementTicks,
    supplementDays,
    supplementDueDays,
    waterGoalDays,
    firstDay,
    volumeSets,
    exerciseMuscles,
    daily: dailyRows.map((r) => ({
      exerciseId: r.exercise_id,
      day: r.day,
      bestE1rmKg: num(r.best_e1rm_kg),
      sets: Number(r.sets ?? 0),
      volumeKg: Number(r.volume_kg ?? 0),
    })),
  };
}

export function useTimeZone(): string {
  return useProfile().data?.timezone ?? deviceTimeZone();
}

/** The raw activity, read from the device. Refreshed whenever other data changes (below). */
export function useActivity() {
  const tz = useTimeZone();
  return useQuery({
    queryKey: [...gamificationKey, tz],
    queryFn: () => fetchActivity(tz),
    staleTime: 0,
  });
}

/**
 * The input of a day: the activity plus the week start (weekly badge rules) and the plan
 * (Supporter / Premium badges, DECISIONS 126). Both default to what this device knows now.
 */
export function inputOf(
  activity: Activity,
  today: string,
  ctx: { weekStart?: 'mon' | 'sun'; plan?: BadgePlan | null } = {},
): GamificationInput {
  return {
    ...activity,
    today,
    weekStart: ctx.weekStart ?? usePreferencesStore.getState().weekStart,
    plan: ctx.plan !== undefined ? ctx.plan : usePlanStore.getState().plan,
  };
}

/** Streak, level, badges and records, computed on the device. Null while loading. */
export type GameData = Gamification & { activity: Activity };

export function useGamification(): GameData | null {
  const today = useToday();
  const activity = useActivity();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const plan = usePlanStore((s) => s.plan);
  if (!activity.data) return null;
  return {
    ...computeGamification(inputOf(activity.data, today, { weekStart, plan })),
    activity: activity.data,
  };
}

/**
 * The app invalidates its own queries after each change (a workout finished, food logged, a
 * check-in): the gamification follows any of them, at most once a second.
 */
export function useGamificationRefresh() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'invalidate') return;
      if (event.query.queryKey[1] === gamificationKey[1]) return;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: gamificationKey });
      }, 1000);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [queryClient]);
}

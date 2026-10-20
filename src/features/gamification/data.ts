import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { deviceTimeZone, localDay, localHour } from '@/domain/day';
import { dietDayStatus, goalForDay, targetForDay } from '@/domain/diet';
import {
  computeGamification,
  type ExerciseDay,
  type Gamification,
  type GamificationInput,
  type WorkoutDay,
} from '@/domain/gamification';
import type { DailyE1rm } from '@/domain/progress';
import { fetchGoals } from '@/features/diet/log';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { getSupabase } from '@/lib/supabase';

/** Everything the streak, XP, records, badges and community scores are computed from. */
export type Activity = Omit<GamificationInput, 'today' | 'workouts'> & {
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
  const [food, checks, body, sessions, sets, totals, daily, goals, supps, suppLogs, water] =
    await Promise.all([
      db.from('food_logs').select('day').is('deleted_at', null),
      db.from('fixed_meal_checks').select('day, status').is('deleted_at', null),
      db.from('body_metrics').select('day').is('deleted_at', null),
      db
        .from('workout_sessions')
        .select('id, plan_id, started_at')
        .eq('status', 'done')
        .is('deleted_at', null),
      db.from('session_sets').select('session_id, completed_at').is('deleted_at', null),
      db.from('daily_nutrition_totals').select('day, kcal'),
      db
        .from('exercise_e1rm_daily')
        .select('exercise_id, day, best_e1rm_kg, best_weight_kg, sets, volume_kg'),
      fetchGoals(),
      // Deleted supplements too: a day only asks for the supplements the user had on that day.
      db.from('supplements').select('id, created_at, deleted_at'),
      db.from('supplement_logs').select('day, supplement_id').is('deleted_at', null),
      db.from('water_logs').select('day, ml').is('deleted_at', null),
    ]);

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
  const loggedDays = new Set<string>(checkInDays);
  for (const r of rowsOf<{ day: string }>(food as Rows)) loggedDays.add(r.day);
  for (const r of rowsOf<{ day: string; status: string }>(checks as Rows))
    if (r.status === 'done' || r.status === 'adjusted') loggedDays.add(r.day);
  for (const w of workouts) loggedDays.add(w.day);

  // Diet on target: within 10 % of that day's target (training-day bonus included). Days without
  // a target (DECISIONS 104) never count.
  const trained = new Set(workouts.map((w) => w.day));
  const dietOnTargetDays = new Set<string>();
  for (const t of rowsOf<{ day: string; kcal: number | string }>(totals as Rows)) {
    const target = targetForDay(goalForDay(goals, t.day), trained.has(t.day));
    if (!target) continue;
    if (dietDayStatus(Number(t.kcal), target.kcal) === 'onTarget') dietOnTargetDays.add(t.day);
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
  for (const r of rowsOf<{ day: string; supplement_id: string }>(suppLogs as Rows))
    takenByDay.set(r.day, (takenByDay.get(r.day) ?? new Set()).add(r.supplement_id));
  const supplementDays = new Set<string>();
  for (const [day, taken] of takenByDay) {
    const due = supplementList.filter((x) => x.from <= day && (x.until == null || x.until > day));
    if (due.length > 0 && due.every((x) => taken.has(x.id))) supplementDays.add(day);
  }
  const noSupplements = !supplementList.some((x) => x.until == null);

  // Water: the day's glasses reach that day's goal.
  const waterByDay = new Map<string, number>();
  for (const r of rowsOf<{ day: string; ml: number | string }>(water as Rows))
    waterByDay.set(r.day, (waterByDay.get(r.day) ?? 0) + Number(r.ml));
  const waterGoalDays = new Set<string>();
  for (const [day, ml] of waterByDay) {
    const goalMl = goalForDay(goals, day)?.waterMl ?? 2000;
    if (goalMl > 0 && ml >= goalMl) waterGoalDays.add(day);
  }

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
    supplementDays,
    waterGoalDays,
    noSupplements,
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

export function inputOf(activity: Activity, today: string): GamificationInput {
  return { ...activity, today };
}

/** Streak, level, badges and records, computed on the device. Null while loading. */
export type GameData = Gamification & { activity: Activity };

export function useGamification(): GameData | null {
  const today = useToday();
  const activity = useActivity();
  if (!activity.data) return null;
  return { ...computeGamification(inputOf(activity.data, today)), activity: activity.data };
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

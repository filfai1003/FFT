import { useQuery } from '@tanstack/react-query';
import { addDays, deviceTimeZone, localDay } from '@/domain/day';
import { goalForDay } from '@/domain/diet';
import {
  ageOnDay,
  effectiveWaterTarget,
  workoutMinutes,
  type EffectiveWater,
  type WaterSex,
} from '@/domain/hydration';
import { useSessionStore } from '@/features/auth/session-store';
import { useProfile } from '@/features/profile/api';
import { useMonthSessions } from '@/features/train/history';
import { getSupabase } from '@/lib/supabase';
import { fetchGoals, useGoals, type GoalWithMaintenance } from './log';

/**
 * The one way the app reads the day's water target (DECISIONS 127): Today's water card, the Diet
 * targets page, the water nudge, the home screen widget and the badges (water-goal days) all go
 * through `waterTargetFromData`, so they always show the same number.
 *
 * Training day = a FINISHED workout that day (the same rule as the training-day calories): the
 * target goes up once the workout is saved. A plan's "up next" day does not count, since any day
 * can be trained at any time (rotation) and it would make every day a training day.
 */

/** What the target is computed from. */
export type WaterTargetData = {
  day: string;
  goals: readonly GoalWithMaintenance[];
  profile: {
    birth_date: string | null;
    sex: string | null;
    height_cm: number | string | null;
  } | null;
  /** The last weight logged on or before the day. */
  weightKg: number | null;
  /** That day's finished workouts. */
  workouts: readonly { startedAt: string; endedAt: string | null }[];
};

/** The water target in force on a day (pure: the data is read by the caller). */
export function waterTargetFromData(d: WaterTargetData): EffectiveWater {
  const goal = goalForDay(d.goals, d.day);
  const p = d.profile;
  const sex: WaterSex = p?.sex === 'male' || p?.sex === 'female' ? p.sex : null;
  return effectiveWaterTarget(goal, {
    weightKg: d.weightKg,
    heightCm: p?.height_cm != null ? Number(p.height_cm) : null,
    ageYears: ageOnDay(p?.birth_date, d.day),
    sex,
    trainedToday: d.workouts.length > 0,
    workoutMinutes: workoutMinutes(d.workouts),
  });
}

/** The last weight logged on or before `day` (kg), or null. */
export async function fetchWeightOn(day: string): Promise<number | null> {
  const { data, error } = await getSupabase()
    .from('body_metrics')
    .select('weight_kg, day')
    .not('weight_kg', 'is', null)
    .is('deleted_at', null)
    .lte('day', day)
    .order('day', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0]?.weight_kg != null ? Number(data[0].weight_kg) : null;
}

/** The finished workouts of a day, in the profile time zone. */
export async function fetchWorkoutsOn(day: string, tz: string) {
  const { data, error } = await getSupabase()
    .from('workout_sessions')
    .select('started_at, ended_at')
    .eq('status', 'done')
    .is('deleted_at', null)
    .gte('started_at', new Date(`${addDays(day, -1)}T00:00:00Z`).toISOString())
    .lte('started_at', new Date(`${addDays(day, 2)}T00:00:00Z`).toISOString());
  if (error) throw error;
  return (data as { started_at: string; ended_at: string | null }[])
    .filter((s) => localDay(new Date(s.started_at), tz) === day)
    .map((s) => ({ startedAt: s.started_at, endedAt: s.ended_at }));
}

async function fetchProfileDetails() {
  const userId = useSessionStore.getState().userId;
  let query = getSupabase().from('profiles').select('birth_date, sex, height_cm, timezone');
  if (userId) query = query.eq('id', userId);
  const { data, error } = await query.limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

/**
 * The water target of a day, read from the device: for code outside React (reminders, the home
 * screen widget task, the badges). `goals` can be passed when the caller has them already.
 */
export async function waterTargetForDay(
  day: string,
  opts: { tz?: string; goals?: readonly GoalWithMaintenance[] } = {},
): Promise<EffectiveWater> {
  const [profile, goals, weightKg] = await Promise.all([
    fetchProfileDetails(),
    opts.goals ?? fetchGoals(),
    fetchWeightOn(day),
  ]);
  const tz = opts.tz ?? profile?.timezone ?? deviceTimeZone();
  const workouts = await fetchWorkoutsOn(day, tz);
  return waterTargetFromData({ day, goals, profile, weightKg, workouts });
}

/**
 * The water target of a day in a screen: `target` is null until the data is read. Built on the
 * queries the screens already use (profile, goals, the month's workouts, the weight), so it
 * updates by itself after a workout, a weigh-in or a change of the profile or the target.
 */
export function useWaterTarget(day: string): { target: EffectiveWater | null } {
  const profile = useProfile();
  const goals = useGoals();
  const sessions = useMonthSessions(day.slice(0, 7));
  const weight = useQuery({
    queryKey: ['body', 'weight-on', day],
    queryFn: () => fetchWeightOn(day),
  });
  if (!profile.data || !goals.data || !sessions.data || weight.data === undefined)
    return { target: null };
  const tz = profile.data.timezone ?? deviceTimeZone();
  const workouts = sessions.data
    .filter((s) => localDay(new Date(s.startedAt), tz) === day)
    .map((s) => ({ startedAt: s.startedAt, endedAt: s.endedAt }));
  return {
    target: waterTargetFromData({
      day,
      goals: goals.data,
      profile: profile.data,
      weightKg: weight.data,
      workouts,
    }),
  };
}

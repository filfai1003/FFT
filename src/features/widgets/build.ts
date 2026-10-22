import { goalForDay, mealForHour, mealsDone, nextFixedMeal, targetForDay } from '@/domain/diet';
import { defaultAppearance } from '@/design/appearance-store';
import { effectiveAreaColors } from '@/design/area-colors';
import { addDays, deviceTimeZone, localDay, localHour } from '@/domain/day';
import type { WeightUnit } from '@/domain/units';
import { fetchFixedChecks, fetchFixedPlan } from '@/features/diet/fixed';
import {
  fetchDayLog,
  fetchDayTotals,
  fetchGoals,
  fetchTrainedDays,
  fetchWater,
} from '@/features/diet/log';
import { waterTargetForDay } from '@/features/diet/water-target';
import { waterGoal } from '@/features/today/day-logic';
import { fetchBodyEntries } from '@/features/progress/data';
import { nextSetTarget, quickSetValues, type ActiveSession } from '@/features/session/logic';
import { useSessionStore as useWorkoutStore } from '@/features/session/store';
import { rowToState } from '@/features/settings/mapping';
import { fetchSupplementLogs, fetchSupplements } from '@/features/supplements/data';
import { fetchPlans, fetchPlanSessions, rotationOf } from '@/features/train/plans';
import { planOf } from '@/lib/plan';
import { getSupabase } from '@/lib/supabase';
import type { Row } from '@/types/db';
import { widgetToken } from './links';
import type { ActiveWorkout, WidgetSnapshot } from './snapshot';

/** Waits until a persisted zustand store has read its saved state back (the task may have just started). */
export async function whenHydrated(store: {
  persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void };
}) {
  if (store.persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    const off = store.persist.onFinishHydration(() => {
      off();
      resolve();
    });
    if (store.persist.hasHydrated()) {
      off();
      resolve();
    }
  });
}

/** True when the health data consent is in force: without it the app does not run, nor do the widgets. */
export async function healthConsentActive(): Promise<boolean> {
  const { data, error } = await getSupabase().from('consents').select('type, withdrawn_at');
  if (error) throw error;
  return (data as { type: string; withdrawn_at: string | null }[]).some(
    (c) => c.type === 'health_data' && c.withdrawn_at == null,
  );
}

/** The workout in progress as the Workout widget shows it. */
export function activeWorkout(s: ActiveSession): ActiveWorkout {
  const target = nextSetTarget(s);
  const e = target ? s.exercises[target.exercise] : null;
  const quick = e && target ? quickSetValues(e, target.set) : null;
  const set = e && target ? e.sets[target.set] : null;
  return {
    sessionId: s.id,
    exercise: e?.name ?? null,
    setNumber: target ? target.set + 1 : 0,
    setsTotal: e?.sets.length ?? 0,
    weight: quick?.weight || null,
    reps: quick?.reps ?? null,
    unit: s.weightUnit,
    quick: quick != null,
    setId: set?.id ?? null,
    restEndsAt: s.rest?.endsAt ?? null,
  };
}

/**
 * Builds what the widgets show from the on-device database of the signed-in account (getSupabase,
 * the same reads as the app's screens) and the workout in progress. Null when the health data
 * consent is withdrawn: the widgets then only offer to open the app.
 */
export async function buildSnapshot(
  userId: string,
  now = new Date(),
): Promise<WidgetSnapshot | null> {
  const supabase = getSupabase();
  if (!(await healthConsentActive())) return null;

  const profile = await supabase
    .from('profiles')
    .select('timezone, diet_mode')
    .eq('id', userId)
    .maybeSingle();
  if (profile.error) throw profile.error;
  const settings = await supabase.from('user_settings').select('*').maybeSingle();
  if (settings.error) throw settings.error;
  const stored = settings.data ? rowToState(settings.data as Row<'user_settings'>) : null;
  const prefs = stored?.prefs ?? null;
  const appearance = stored?.appearance ?? defaultAppearance;
  const weightUnit: WeightUnit = prefs?.weightUnit ?? 'kg';
  const glassMl = prefs?.waterGlassMl ?? 250;

  const tz = profile.data?.timezone ?? deviceTimeZone();
  const today = localDay(now, tz);
  const yesterday = addDays(today, -1);

  // Calories, the same target as Today and Diet (training-day bonus included).
  const [eaten, goals, trained, water] = await Promise.all([
    fetchDayTotals(today),
    fetchGoals(),
    fetchTrainedDays(today, today, tz),
    fetchWater(today),
  ]);
  // The day's water target, the same as Today's card (DECISIONS 127).
  const waterTarget = await waterTargetForDay(today, { tz, goals });
  const goal = goalForDay(goals, today);
  const target = goal ? targetForDay(goal, trained.has(today)) : null;

  // Diet: the next fixed meal, or the meal of the time of day and yesterday's of it.
  const mode = profile.data?.diet_mode === 'fixed_meals' ? 'fixed_meals' : 'tracking';
  const meal = mealForHour(localHour(now, tz));
  let diet: WidgetSnapshot['diet'] = {
    mode,
    nextMeal: null,
    mealsDone: 0,
    mealsTotal: 0,
    meal,
    mealEmpty: true,
    yesterdayCount: 0,
  };
  if (mode === 'fixed_meals') {
    const [plan, checks] = await Promise.all([fetchFixedPlan(), fetchFixedChecks(today)]);
    const meals = plan?.meals ?? [];
    const nextId = nextFixedMeal(meals, checks);
    const next = meals.find((m) => m.id === nextId);
    diet = {
      ...diet,
      nextMeal: next
        ? { id: next.id, name: next.name, kcal: next.kcal, description: next.description }
        : null,
      mealsDone: mealsDone(checks),
      mealsTotal: meals.length,
    };
  } else {
    const [todayLog, yesterdayLog] = await Promise.all([
      fetchDayLog(today),
      fetchDayLog(yesterday),
    ]);
    diet = {
      ...diet,
      mealEmpty: !todayLog.some((e) => e.meal === meal),
      yesterdayCount: yesterdayLog.filter((e) => e.meal === meal).length,
    };
  }

  // Training: the workout in progress, else trained today, else the plan's "Up next".
  await whenHydrated(useWorkoutStore);
  const running = useWorkoutStore.getState().active;
  const plans = await fetchPlans();
  const plan = plans.find((p) => p.status === 'active') ?? null;
  const rotation = plan ? rotationOf(plan, await fetchPlanSessions(plan.id)) : null;
  const upNext = plan?.days.find((d) => d.id === rotation?.state.upNextDayId) ?? plan?.days[0];
  const sessions = await supabase
    .from('workout_sessions')
    .select('day_name, started_at')
    .eq('status', 'done')
    .is('deleted_at', null)
    .gte('started_at', new Date(`${yesterday}T00:00:00Z`).toISOString())
    .lte('started_at', new Date(`${addDays(today, 2)}T00:00:00Z`).toISOString());
  if (sessions.error) throw sessions.error;
  const doneToday = (sessions.data as { day_name: string | null; started_at: string }[]).filter(
    (s) => localDay(new Date(s.started_at), tz) === today,
  );
  const workout: WidgetSnapshot['workout'] = running
    ? {
        kind: 'active',
        name: running.dayName,
        exercises: running.exercises.length,
        dayId: running.planDayId,
        active: activeWorkout(running),
      }
    : doneToday.length > 0
      ? {
          kind: 'done',
          name:
            doneToday
              .map((s) => s.day_name)
              .filter(Boolean)
              .join(', ') || null,
          exercises: 0,
          dayId: null,
          active: null,
        }
      : upNext
        ? {
            kind: 'next',
            name: upNext.name,
            exercises: upNext.exercises.length,
            dayId: upNext.id,
            active: null,
          }
        : { kind: 'none', name: null, exercises: 0, dayId: null, active: null };

  // Body: the latest weight and the change over 7 days (entries come oldest first).
  const weights = (await fetchBodyEntries()).filter((e) => e.weightKg != null).reverse();
  const latest = weights[0];
  const weekAgo = weights.find((e) => e.day <= addDays(today, -7));

  const [supplements, logs] = await Promise.all([
    fetchSupplements(),
    fetchSupplementLogs(today, today),
  ]);
  const taken = logs.get(today);

  return {
    v: 2,
    userId,
    day: today,
    timeZone: tz,
    weightUnit,
    look: {
      accent: appearance.accent,
      highContrast: appearance.highContrast,
      textScaleStep: appearance.textScaleStep,
      bold: appearance.boldText,
      // Area colours (DECISIONS 118): the choice for Supporter / Premium, the defaults otherwise.
      areas: effectiveAreaColors(appearance.areaColors, await planOf(userId)),
    },
    restAlerts: prefs?.notifications.rest_timer ?? true,
    token: await widgetToken(),
    calories: {
      eaten: eaten.kcal,
      target: target?.kcal ?? null,
      macros: (['protein', 'carbs', 'fat'] as const).map((key) => ({
        key,
        eaten: eaten[key],
        target: target ? target[key] : null,
      })),
    },
    diet,
    water: {
      ml: water.totalMl,
      glassMl,
      goalGlasses: waterGoal(glassMl, waterTarget.ml).glasses,
    },
    workout,
    weight: {
      kg: latest?.weightKg ?? null,
      change7:
        latest?.weightKg != null && weekAgo?.weightKg != null
          ? latest.weightKg - weekAgo.weightKg
          : null,
      day: latest?.day ?? null,
    },
    supplements: supplements.map((x) => ({
      id: x.id,
      name: x.name,
      taken: taken?.has(x.id) ?? false,
    })),
  };
}

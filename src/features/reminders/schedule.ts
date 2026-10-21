import AsyncStorage from '@react-native-async-storage/async-storage';
import { t as translate } from 'i18next';
import { Platform } from 'react-native';
import { deviceTimeZone, localDay } from '@/domain/day';
import { goalForDay, hasTarget } from '@/domain/diet';
import {
  clockMinutes,
  planReminders,
  updateSent,
  type PlannedReminder,
  type PlannerInput,
} from '@/domain/reminders';
import type { WeightUnit } from '@/domain/units';
import { buildWeeklySummary, type WeeklySummary } from '@/domain/weekly-summary';
import { fetchFixedChecks, fetchFixedPlan } from '@/features/diet/fixed';
import { fetchDayLog, fetchGoals, fetchWater } from '@/features/diet/log';
import { fetchActivity } from '@/features/gamification/data';
import { fetchBodyEntries } from '@/features/progress/data';
import { useSessionStore as useWorkoutStore } from '@/features/session/store';
import { rowToState } from '@/features/settings/mapping';
import type { Preferences } from '@/features/settings/preferences-store';
import { fetchPlans, fetchPlanSessions, rotationOf } from '@/features/train/plans';
import { healthConsentActive, whenHydrated } from '@/features/widgets/build';
import { weeklyLine } from '@/features/weekly/text';
import type { Translate } from '@/i18n';
import {
  cancelSmartReminders,
  dismissStaleSmartReminders,
  scheduleSmartReminders,
  type SmartNotification,
} from '@/lib/notifications';
import { useReminderTimes, type ReminderTimes } from '@/lib/reminder-times';
import { getSupabase } from '@/lib/supabase';
import type { Row } from '@/types/db';

const t = translate as unknown as Translate;

/**
 * Smart reminders on the device (DECISIONS 122): reads the user's data from the on-device
 * database, asks the planner (`domain/reminders`) what to schedule for the next days, and
 * replaces the scheduled local notifications with that. There is no background job: it runs when
 * the app opens, comes back or goes to the background, after every change of the data (a meal
 * logged, a workout finished, water) and after a widget quick action. Between those, what was
 * scheduled last stays valid for the next three days.
 */

const STATE_KEY = 'fft.reminders.state';

type Stored = {
  /** Ids already delivered (never sent again). */
  sent: string[];
  /** What was scheduled last time, to learn what has gone off since. */
  scheduled: { id: string; day: string; at: number }[];
};

async function readStored(): Promise<Stored> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : {};
    return {
      sent: Array.isArray(parsed.sent) ? parsed.sent.filter((s) => typeof s === 'string') : [],
      scheduled: Array.isArray(parsed.scheduled) ? parsed.scheduled : [],
    };
  } catch {
    return { sent: [], scheduled: [] };
  }
}

/** Minutes after midnight of `now` in a time zone. */
export function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (get('hour') % 24) * 60 + get('minute');
}

/**
 * The instant of a day and minute in a time zone (the user's profile one, the same as the days of
 * the data). Corrected twice so it lands right around a daylight saving change.
 */
export function dateAt(day: string, at: number, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const wanted = Date.UTC(y, m - 1, d, Math.floor(at / 60), at % 60);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const shown = new Date(guess);
    const [sy, sm, sd] = localDay(shown, timeZone).split('-').map(Number);
    const seen = Date.UTC(sy, sm - 1, sd) + localMinutes(shown, timeZone) * 60_000;
    guess += wanted - seen;
  }
  return new Date(guess);
}

/** Where a tap on each reminder goes (Expo Router paths). */
export function reminderLink(r: PlannedReminder): string {
  switch (r.type) {
    case 'meal':
      return r.meal ? `/food-search?meal=${r.meal}` : '/diet';
    case 'training':
      return '/train';
    case 'water':
      return '/';
    case 'weekly':
      return `/progress/week?from=${r.weekFrom ?? ''}`;
  }
}

/** The title and text of a reminder. */
export function reminderCopy(
  r: PlannedReminder,
  tr: Translate,
  weekly: { summary: WeeklySummary; unit: WeightUnit; dietTracked: boolean } | null,
): { title: string; body: string } {
  switch (r.type) {
    case 'meal':
      if (r.fixedMeal)
        return {
          title: r.fixedMeal.name,
          body: tr('smartReminders.fixedBody'),
        };
      return {
        title: tr('smartReminders.mealTitle', { meal: tr(`diet.meal.${r.meal ?? 'lunch'}`) }),
        body: tr('smartReminders.mealBody', {
          meal: tr(`smartReminders.mealLower.${r.meal ?? 'lunch'}`),
        }),
      };
    case 'training':
      return {
        title: r.dayName
          ? tr('smartReminders.trainingTitle', { name: r.dayName })
          : tr('smartReminders.trainingTitleNoPlan'),
        body: tr('smartReminders.trainingBody'),
      };
    case 'water':
      return { title: tr('smartReminders.waterTitle'), body: tr('smartReminders.waterBody') };
    case 'weekly':
      return {
        title: tr('smartReminders.weeklyTitle'),
        body:
          weekly && weekly.summary.from === r.weekFrom
            ? weeklyLine(weekly.summary, tr, weekly.unit, weekly.dietTracked)
            : tr('smartReminders.weeklyGeneric'),
      };
  }
}

export type RescheduleOptions = {
  /** The app's current choices (the stores); read from the database when left out (widget task). */
  prefs?: Preferences;
  times?: ReminderTimes;
  now?: Date;
};

const anySmart = (n: Preferences['notifications']) =>
  n.meals || n.workout_reminder || n.water || n.weekly_summary;

async function readPrefs(): Promise<Preferences | null> {
  const settings = await getSupabase().from('user_settings').select('*').maybeSingle();
  if (settings.error) throw settings.error;
  return settings.data ? rowToState(settings.data as Row<'user_settings'>).prefs : null;
}

async function readTimes(): Promise<ReminderTimes> {
  const store = useReminderTimes.getState();
  if (!store.loaded) await store.load();
  return useReminderTimes.getState().times;
}

type UserClock = {
  tz: string;
  today: string;
  nowMin: number;
  mode: 'tracking' | 'fixed_meals';
};

/** The user's time zone (the profile's, as the days of the data), today and the diet mode. */
async function userClock(userId: string, now: Date): Promise<UserClock> {
  const profile = await getSupabase()
    .from('profiles')
    .select('timezone, diet_mode')
    .eq('id', userId)
    .maybeSingle();
  if (profile.error) throw profile.error;
  const tz = profile.data?.timezone ?? deviceTimeZone();
  return {
    tz,
    today: localDay(now, tz),
    nowMin: localMinutes(now, tz),
    mode: profile.data?.diet_mode === 'fixed_meals' ? 'fixed_meals' : 'tracking',
  };
}

/** Everything the planner needs, read from the device. */
export async function plannerInput(
  prefs: Preferences,
  times: ReminderTimes,
  sent: ReadonlySet<string>,
  clock: UserClock,
): Promise<{ input: PlannerInput; summary: WeeklySummary; dietTracked: boolean }> {
  const { tz, today, nowMin, mode } = clock;
  const [activity, goals, water, weights, plans] = await Promise.all([
    fetchActivity(tz),
    fetchGoals(),
    fetchWater(today),
    fetchBodyEntries(),
    fetchPlans(),
  ]);

  let fixed: { id: string; name: string }[] = [];
  let loggedToday = new Set<string>();
  if (mode === 'fixed_meals') {
    const [plan, checks] = await Promise.all([fetchFixedPlan(), fetchFixedChecks(today)]);
    fixed = (plan?.meals ?? []).map((m) => ({ id: m.id, name: m.name }));
    loggedToday = new Set(checks.map((c) => c.fixedMealId));
  } else {
    loggedToday = new Set((await fetchDayLog(today)).map((e) => e.meal));
  }

  await whenHydrated(useWorkoutStore);
  const running = useWorkoutStore.getState().active;
  const plan = plans.find((p) => p.status === 'active') ?? null;
  const rotation = plan ? rotationOf(plan, await fetchPlanSessions(plan.id)) : null;
  const upNext = plan?.days.find((d) => d.id === rotation?.state.upNextDayId) ?? plan?.days[0];
  const workoutDays = activity.workouts.map((w) => w.day);

  const goal = goalForDay(goals, today);
  const dietTracked = hasTarget(goal);
  const summary = buildWeeklySummary({
    day: today,
    today,
    weekStart: prefs.weekStart,
    activity,
    planDays: plan?.days.length ?? null,
    weights: weights
      .filter((e) => e.weightKg != null)
      .map((e) => ({ day: e.day, kg: e.weightKg as number })),
  });

  const n = prefs.notifications;
  return {
    input: {
      today,
      nowMin,
      enabled: {
        meals: n.meals,
        training: n.workout_reminder,
        water: n.water,
        weekly: n.weekly_summary,
      },
      quiet: times.quiet.on
        ? { start: clockMinutes(times.quiet.start), end: clockMinutes(times.quiet.end) }
        : null,
      maxPerDay: times.maxPerDay,
      sent,
      meals: { mode, times: times.meals.map(clockMinutes), fixed, loggedToday },
      training: {
        time: clockMinutes(times.workout),
        upNext: upNext ? { id: upNext.id, name: upNext.name } : null,
        workoutDays,
        trainedToday: running != null || workoutDays.includes(today),
      },
      water: {
        time: clockMinutes(times.water),
        todayMl: water.totalMl,
        goalMl: goal?.waterMl || 2000,
      },
      weekly: { time: clockMinutes(times.weekly), weekStart: prefs.weekStart },
    },
    summary,
    dietTracked,
  };
}

let chain: Promise<unknown> = Promise.resolve();

/** One reschedule at a time (a log and the app going to the background can come together). */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

/**
 * Plans and schedules the smart reminders of the next days for the signed-in account. Never asks
 * for the permission (Settings does, when a reminder is switched on); without it, or without the
 * health data consent, nothing is scheduled.
 */
export function rescheduleReminders(userId: string, opts: RescheduleOptions = {}): Promise<void> {
  return serial(async () => {
    if (Platform.OS === 'web') return;
    const now = opts.now ?? new Date();
    const prefs = opts.prefs ?? (await readPrefs());
    if (!prefs || !anySmart(prefs.notifications) || !(await healthConsentActive())) {
      await cancelSmartReminders();
      await dismissStaleSmartReminders(new Set());
      return;
    }
    const times = opts.times ?? (await readTimes());
    const stored = await readStored();
    const clock = await userClock(userId, now);
    const sent = updateSent(stored.sent, stored.scheduled, clock.today, clock.nowMin);

    const { input, summary, dietTracked } = await plannerInput(prefs, times, new Set(sent), clock);
    const plan = planReminders(input);
    const weekly = { summary, unit: prefs.weightUnit, dietTracked };
    const list: SmartNotification[] = plan.schedule.map((r) => ({
      id: r.id,
      date: dateAt(r.day, r.at, clock.tz),
      url: reminderLink(r),
      ...reminderCopy(r, t, weekly),
    }));
    const ok = await scheduleSmartReminders(list);
    await AsyncStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        sent,
        scheduled: ok ? plan.schedule.map((r) => ({ id: r.id, day: r.day, at: r.at })) : [],
      } satisfies Stored),
    ).catch(() => undefined);
    await dismissStaleSmartReminders(plan.relevant);
  });
}

/** Removes the scheduled smart reminders, after any reschedule still running (sign out, consent withdrawn). */
export function stopReminders(): Promise<void> {
  return serial(() => cancelSmartReminders());
}

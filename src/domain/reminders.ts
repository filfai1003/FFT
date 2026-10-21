import { addDays, daysBetween, weekOf } from './day';
import { mealForHour, type Meal } from './diet';

/**
 * Smart reminders (DECISIONS 122): which local notifications to schedule for the next days, from
 * what the user logged. Pure, no clock: callers pass the local day and the minute of the day.
 *
 * - Meals: only for meals not logged yet (count foods: the meal of each reminder time, skipped once
 *   that meal has food; fixed meals: the plan's meals in order on the reminder times, skipped once
 *   ticked, adjusted or skipped).
 * - Training: on the weekdays the user usually trains, naming the plan's Up next day; not once
 *   trained (or training) today.
 * - Water: a nudge, not when today's glasses are already where they should be by then.
 * - Weekly summary: on the last day of the week (outside the daily cap).
 *
 * Every reminder has a stable id (kind, what, day) without its time, so a reminder already
 * delivered is never sent again, even when its time changes. Quiet hours drop a reminder (a meal
 * reminder moved to the morning would make no sense); at most `maxPerDay` a day (training first,
 * then meals in time order, then water), counting the ones already delivered that day.
 */

export type ReminderType = 'meal' | 'training' | 'water' | 'weekly';

/** Minutes after local midnight (0–1439). */
export type Minutes = number;

export const DEFAULT_MAX_PER_DAY = 3;
/** Today and the next two days: the app reschedules on every open and log, this covers the gaps. */
export const HORIZON_DAYS = 3;
/** History used to learn the usual training weekdays. */
export const USUAL_WEEKS = 6;

export type PlannerInput = {
  today: string;
  nowMin: Minutes;
  horizonDays?: number;
  enabled: { meals: boolean; training: boolean; water: boolean; weekly: boolean };
  /** No reminder from start until end (wraps over midnight when start > end; equal = none). */
  quiet: { start: Minutes; end: Minutes } | null;
  maxPerDay: number;
  /** Ids already delivered (they are never sent again). */
  sent: ReadonlySet<string>;
  meals: {
    mode: 'tracking' | 'fixed_meals';
    /** The user's meal reminder times. */
    times: readonly Minutes[];
    /** Fixed meals mode: the plan's meals, in order. */
    fixed: readonly { id: string; name: string }[];
    /** Today: count foods = meals with food; fixed meals = ids of the meals checked. */
    loggedToday: ReadonlySet<string>;
  };
  training: {
    time: Minutes;
    upNext: { id: string; name: string } | null;
    /** Days with a finished workout (any time; only the last weeks are looked at). */
    workoutDays: readonly string[];
    /** Finished a workout today or one is in progress. */
    trainedToday: boolean;
  };
  water: { time: Minutes; todayMl: number; goalMl: number };
  weekly: { time: Minutes; weekStart: 'mon' | 'sun' };
};

export type PlannedReminder = {
  id: string;
  type: ReminderType;
  day: string;
  at: Minutes;
  /** Count foods: the meal. */
  meal?: Meal;
  /** Fixed meals: the plan meal (id and name). */
  fixedMeal?: { id: string; name: string };
  /** Training: the Up next day's name (null without a plan). */
  dayName?: string | null;
  /** Weekly summary: the first day of the week it sums up. */
  weekFrom?: string;
};

export type ReminderPlan = {
  /** To schedule: in the future, not delivered yet, within the cap, outside quiet hours. */
  schedule: PlannedReminder[];
  /**
   * Ids still worth showing (their condition holds, whatever the time). A delivered notification
   * whose id is not here (lunch logged, trained) can be taken out of the notification list.
   */
  relevant: Set<string>;
};

export const clockMinutes = (c: { hour: number; minute: number }): Minutes =>
  c.hour * 60 + c.minute;

/** True when a time falls in the quiet hours. */
export function inQuietHours(at: Minutes, quiet: PlannerInput['quiet']): boolean {
  if (!quiet || quiet.start === quiet.end) return false;
  return quiet.start < quiet.end
    ? at >= quiet.start && at < quiet.end
    : at >= quiet.start || at < quiet.end;
}

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/**
 * The weekdays the user usually trains: a weekday with a workout in at least 2 of the last 6 weeks
 * (today not included). Null while there is too little history (fewer than 3 workout days): then
 * every day counts, as the plain daily reminder did.
 */
export function usualTrainingWeekdays(
  workoutDays: readonly string[],
  today: string,
  weeks = USUAL_WEEKS,
): Set<number> | null {
  const from = addDays(today, -7 * weeks);
  const days = new Set(workoutDays.filter((d) => d >= from && d < today));
  if (days.size < 3) return null;
  const perWeekday = new Map<number, number>();
  for (const d of days) perWeekday.set(weekdayOf(d), (perWeekday.get(weekdayOf(d)) ?? 0) + 1);
  return new Set([...perWeekday].filter(([, n]) => n >= 2).map(([w]) => w));
}

/** Water: how much of the day's goal should be drunk by a time (from 8:00 to 21:00, linear). */
export function expectedWaterShare(at: Minutes): number {
  return Math.min(1, Math.max(0, (at - 8 * 60) / (13 * 60)));
}

/** The last day of the week on or after `today`, and the week it closes. */
function weekEnds(today: string, weekStart: 'mon' | 'sun', count: number) {
  const out: { day: string; from: string }[] = [];
  let week = weekOf(today, weekStart);
  while (out.length < count) {
    out.push({ day: week[6]!, from: week[0]! });
    week = weekOf(addDays(week[6]!, 1), weekStart);
  }
  return out;
}

const PRIORITY: Record<Exclude<ReminderType, 'weekly'>, number> = {
  training: 0,
  meal: 1,
  water: 2,
};

export function planReminders(input: PlannerInput): ReminderPlan {
  const horizon = input.horizonDays ?? HORIZON_DAYS;
  const relevant = new Set<string>();
  const schedule: PlannedReminder[] = [];
  const usual = usualTrainingWeekdays(input.training.workoutDays, input.today);
  const isFuture = (day: string, at: Minutes) =>
    day > input.today || (day === input.today && at > input.nowMin);

  for (let i = 0; i < horizon; i++) {
    const day = addDays(input.today, i);
    const isToday = i === 0;
    const candidates: PlannedReminder[] = [];

    if (input.enabled.meals) {
      const times = [...input.meals.times].sort((a, b) => a - b);
      if (input.meals.mode === 'fixed_meals') {
        input.meals.fixed.forEach((m, k) => {
          const at = times[k];
          if (at == null) return;
          if (isToday && input.meals.loggedToday.has(m.id)) return;
          candidates.push({
            id: `meal:${m.id}:${day}`,
            type: 'meal',
            day,
            at,
            fixedMeal: { id: m.id, name: m.name },
          });
        });
      } else {
        // One reminder per meal: a second time for the same meal would repeat the first.
        const seen = new Set<Meal>();
        for (const at of times) {
          const meal = mealForHour(Math.floor(at / 60));
          if (seen.has(meal)) continue;
          seen.add(meal);
          if (isToday && input.meals.loggedToday.has(meal)) continue;
          candidates.push({ id: `meal:${meal}:${day}`, type: 'meal', day, at, meal });
        }
      }
    }

    if (input.enabled.training) {
      const usualDay = usual == null || usual.has(weekdayOf(day));
      if (usualDay && !(isToday && input.training.trainedToday)) {
        candidates.push({
          id: `training:${day}`,
          type: 'training',
          day,
          at: input.training.time,
          dayName: input.training.upNext?.name ?? null,
        });
      }
    }

    if (input.enabled.water && input.water.goalMl > 0) {
      const at = input.water.time;
      const behind =
        !isToday || input.water.todayMl < input.water.goalMl * expectedWaterShare(at);
      if (behind) candidates.push({ id: `water:${day}`, type: 'water', day, at });
    }

    for (const c of candidates) relevant.add(c.id);

    // The cap counts what was already delivered that day.
    const sentToday = [...input.sent].filter(
      (id) => id.endsWith(`:${day}`) && !id.startsWith('weekly:'),
    ).length;
    let room = Math.max(0, input.maxPerDay - sentToday);
    const ordered = candidates
      .filter(
        (c) => isFuture(c.day, c.at) && !input.sent.has(c.id) && !inQuietHours(c.at, input.quiet),
      )
      .sort(
        (a, b) =>
          PRIORITY[a.type as keyof typeof PRIORITY] - PRIORITY[b.type as keyof typeof PRIORITY] ||
          a.at - b.at,
      );
    for (const c of ordered) {
      if (room <= 0) break;
      room--;
      schedule.push(c);
    }
  }

  if (input.enabled.weekly) {
    const at = input.weekly.time;
    const next = weekEnds(input.today, input.weekly.weekStart, 2).find(
      (w) => isFuture(w.day, at) && !input.sent.has(`weekly:${w.from}`),
    );
    if (next && daysBetween(input.today, next.day) <= 7 && !inQuietHours(at, input.quiet)) {
      const r: PlannedReminder = {
        id: `weekly:${next.from}`,
        type: 'weekly',
        day: next.day,
        at,
        weekFrom: next.from,
      };
      schedule.push(r);
      relevant.add(r.id);
    }
  }

  schedule.sort((a, b) => a.day.localeCompare(b.day) || a.at - b.at);
  return { schedule, relevant };
}

/**
 * The delivered ids to remember: the ones scheduled before whose time has now passed, added to the
 * ones already known, and only for the last days (older ids can never come back).
 */
export function updateSent(
  sent: readonly string[],
  scheduled: readonly { id: string; day: string; at: Minutes }[],
  today: string,
  nowMin: Minutes,
): string[] {
  const out = new Set(sent);
  for (const s of scheduled)
    if (s.day < today || (s.day === today && s.at <= nowMin)) out.add(s.id);
  const keepFrom = addDays(today, -8);
  return [...out].filter((id) => (id.split(':').pop() ?? '') >= keepFrom);
}

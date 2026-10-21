import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type Clock = { hour: number; minute: number };
export type ReminderTimes = {
  /** Every day. */
  workout: Clock;
  /** Once a week; weekday 1 = Sunday … 7 = Saturday (the system's numbering). */
  checkin: Clock & { weekday: number };
  /** As many times a day as the user wants (none, one, ten…); three by default. */
  meals: Clock[];
  /** Water nudge (smart reminders, DECISIONS 122). */
  water: Clock;
  /** Weekly summary, on the last day of the week (DECISIONS 122). */
  weekly: Clock;
  /** No smart reminder between start and end (over midnight when start is later). */
  quiet: { on: boolean; start: Clock; end: Clock };
  /** At most this many smart reminders a day (the weekly summary is not counted). */
  maxPerDay: number;
};

export const MAX_PER_DAY_LIMITS = { min: 1, max: 6 } as const;

export const defaultReminderTimes: ReminderTimes = {
  workout: { hour: 18, minute: 0 },
  checkin: { weekday: 5, hour: 8, minute: 0 },
  meals: [
    { hour: 8, minute: 0 },
    { hour: 13, minute: 0 },
    { hour: 20, minute: 0 },
  ],
  water: { hour: 15, minute: 0 },
  weekly: { hour: 19, minute: 0 },
  quiet: { on: true, start: { hour: 22, minute: 0 }, end: { hour: 7, minute: 0 } },
  maxPerDay: 3,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** The time offered for a new meal reminder: 3 hours after the latest one (noon for the first). */
export function nextMealTime(meals: Clock[]): Clock {
  if (meals.length === 0) return { hour: 12, minute: 0 };
  const last = Math.max(...meals.map((m) => m.hour * 60 + m.minute));
  const next = (last + 180) % (24 * 60);
  return { hour: Math.floor(next / 60), minute: next % 60 };
}
export const formatClock = (c: Clock) => `${pad(c.hour)}:${pad(c.minute)}`;

const clock = (raw: unknown, fallback: Clock): Clock => {
  const c = (raw ?? {}) as Partial<Clock>;
  const hour = Number(c.hour);
  const minute = Number(c.minute);
  return {
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback.hour,
    minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : fallback.minute,
  };
};

/** Saved times may be missing or damaged: anything unusable falls back to the default. */
export function sanitizeTimes(raw: unknown): ReminderTimes {
  const r = (raw ?? {}) as Partial<ReminderTimes> & {
    checkin?: { weekday?: unknown };
    quiet?: { on?: unknown; start?: unknown; end?: unknown };
  };
  const d = defaultReminderTimes;
  const weekday = Number(r.checkin?.weekday);
  const meals: unknown[] = Array.isArray(r.meals) ? r.meals : [];
  const max = Number(r.maxPerDay);
  return {
    workout: clock(r.workout, d.workout),
    checkin: {
      ...clock(r.checkin, d.checkin),
      weekday:
        Number.isInteger(weekday) && weekday >= 1 && weekday <= 7 ? weekday : d.checkin.weekday,
    },
    // A saved list is kept as it is (also empty); a damaged entry falls back to noon.
    meals: Array.isArray(r.meals) ? meals.map((m) => clock(m, { hour: 12, minute: 0 })) : d.meals,
    water: clock(r.water, d.water),
    weekly: clock(r.weekly, d.weekly),
    quiet: {
      on: typeof r.quiet?.on === 'boolean' ? r.quiet.on : d.quiet.on,
      start: clock(r.quiet?.start, d.quiet.start),
      end: clock(r.quiet?.end, d.quiet.end),
    },
    maxPerDay:
      Number.isInteger(max) && max >= MAX_PER_DAY_LIMITS.min && max <= MAX_PER_DAY_LIMITS.max
        ? max
        : d.maxPerDay,
  };
}

const KEY = 'fft.reminder-times';

type State = {
  times: ReminderTimes;
  loaded: boolean;
  load: () => Promise<void>;
  set: (patch: Partial<ReminderTimes>) => ReminderTimes;
};

/** When the reminders go off. Reminders are local to this phone, so the times are too. */
export const useReminderTimes = create<State>((set, get) => ({
  times: defaultReminderTimes,
  loaded: false,
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      set({ times: sanitizeTimes(raw ? JSON.parse(raw) : null), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  set: (patch) => {
    const times = sanitizeTimes({ ...get().times, ...patch });
    set({ times });
    AsyncStorage.setItem(KEY, JSON.stringify(times)).catch(() => undefined);
    return times;
  },
}));

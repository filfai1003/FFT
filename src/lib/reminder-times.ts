import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type Clock = { hour: number; minute: number };
export type ReminderTimes = {
  /** Every day. */
  workout: Clock;
  /** Once a week; weekday 1 = Sunday … 7 = Saturday (the system's numbering). */
  checkin: Clock & { weekday: number };
  /** Breakfast, lunch, dinner. */
  meals: [Clock, Clock, Clock];
};

export const defaultReminderTimes: ReminderTimes = {
  workout: { hour: 18, minute: 0 },
  checkin: { weekday: 5, hour: 8, minute: 0 },
  meals: [
    { hour: 8, minute: 0 },
    { hour: 13, minute: 0 },
    { hour: 20, minute: 0 },
  ],
};

const pad = (n: number) => String(n).padStart(2, '0');
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
  const r = (raw ?? {}) as Partial<ReminderTimes> & { checkin?: { weekday?: unknown } };
  const d = defaultReminderTimes;
  const weekday = Number(r.checkin?.weekday);
  const meals = Array.isArray(r.meals) ? r.meals : [];
  return {
    workout: clock(r.workout, d.workout),
    checkin: {
      ...clock(r.checkin, d.checkin),
      weekday:
        Number.isInteger(weekday) && weekday >= 1 && weekday <= 7 ? weekday : d.checkin.weekday,
    },
    meals: [clock(meals[0], d.meals[0]), clock(meals[1], d.meals[1]), clock(meals[2], d.meals[2])],
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

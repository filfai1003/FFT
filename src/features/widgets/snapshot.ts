import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AreaColors } from '@/design/area-colors';
import type { AccentName } from '@/design/tokens';
import type { Meal } from '@/domain/diet';
import { displayWeight, type WeightUnit } from '@/domain/units';

/**
 * What the Android home screen widgets show (DECISIONS 51, 68). Built from the on-device database
 * (build.ts) by the app whenever the data changes, and by the widget task itself after a quick
 * action or a periodic update. The widgets draw from it, so a picture is always at hand even when
 * the database cannot be read. A snapshot of an earlier day shows that day's totals as empty.
 */
export type WidgetSnapshot = {
  /** Shape of the snapshot: an older one (from a previous app version) is rebuilt or ignored. */
  v: 2;
  /** Account the values belong to: the quick actions write to its database. */
  userId: string;
  /** Local day the values belong to, in the profile's time zone. */
  day: string;
  timeZone: string;
  weightUnit: WeightUnit;
  /** The app's look and accessibility settings the widgets follow too. */
  look: {
    accent: AccentName;
    highContrast: boolean;
    textScaleStep: number;
    bold: boolean;
    /** Area colours (DECISIONS 118); missing in snapshots from before: the defaults. */
    areas?: AreaColors;
  };
  /** Rest timer notifications are on (Settings): "Set done" from the widget starts one. */
  restAlerts: boolean;
  /** Secret part of the widget links that send something (the AI coach chips, links.ts). */
  token: string;
  calories: {
    eaten: number;
    target: number | null;
    macros: { key: 'protein' | 'carbs' | 'fat'; eaten: number; target: number | null }[];
  };
  diet: {
    mode: 'tracking' | 'fixed_meals';
    /** Fixed meals: the first meal not ticked yet today (null = all handled, or no plan). */
    nextMeal: { id: string; name: string; kcal: number; description: string } | null;
    mealsDone: number;
    mealsTotal: number;
    /** Count foods: the meal of the time of day, whether it is still empty and yesterday's entries of it. */
    meal: Meal;
    mealEmpty: boolean;
    yesterdayCount: number;
  };
  water: { ml: number; glassMl: number; goalGlasses: number };
  workout: {
    kind: 'next' | 'done' | 'none' | 'active';
    name: string | null;
    exercises: number;
    /** Plan day "Start" opens. */
    dayId: string | null;
    /** The workout in progress (kind 'active'). */
    active: ActiveWorkout | null;
  };
  weight: { kg: number | null; change7: number | null; day: string | null };
  supplements: { id: string; name: string; taken: boolean }[];
};

export type ActiveWorkout = {
  sessionId: string;
  /** Exercise of the next set (null: every set is done, the workout can be finished). */
  exercise: string | null;
  setNumber: number;
  setsTotal: number;
  /** What "Set done" saves (as typed in the session, `unit`); null when there is nothing to go by. */
  weight: string | null;
  reps: string | null;
  unit: WeightUnit;
  /** "Set done" can save the set without typing (quickSetValues). */
  quick: boolean;
  /** Id of the set "Set done" ticks (checked again when the tap arrives). */
  setId: string | null;
  restEndsAt: number | null;
};

export const WIDGET_NAMES = [
  'Calories',
  'Workout',
  'Water',
  'Weight',
  'Supplements',
  'Coach',
] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];

/** A weight in tenths of the user's unit (80.2 kg = 802), for the − / + buttons. */
export function weightTenths(kg: number, unit: WeightUnit): number {
  return Math.round(displayWeight(kg, unit) * 10);
}

const KEY = 'fft.widgets.snapshot';

export async function readSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as WidgetSnapshot) : null;
    // Saved by an older version of the app: drawn as "open the app" until rebuilt.
    return s?.v === 2 ? s : null;
  } catch {
    return null;
  }
}

export async function saveSnapshot(s: WidgetSnapshot | null) {
  try {
    if (s) await AsyncStorage.setItem(KEY, JSON.stringify(s));
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // The widgets keep the previous values.
  }
}

/** The snapshot as it applies today: an earlier day's totals start again from zero. */
export function forToday(s: WidgetSnapshot | null, today: string): WidgetSnapshot | null {
  if (!s || s.day === today) return s;
  return {
    ...s,
    day: today,
    calories: {
      ...s.calories,
      eaten: 0,
      macros: s.calories.macros.map((m) => ({ ...m, eaten: 0 })),
    },
    // Yesterday's meals are not known from here: the actions wait for a rebuild.
    diet: { ...s.diet, nextMeal: null, mealsDone: 0, mealEmpty: true, yesterdayCount: 0 },
    water: { ...s.water, ml: 0 },
    workout:
      s.workout.kind === 'done'
        ? { kind: 'none', name: null, exercises: 0, dayId: null, active: null }
        : s.workout,
    supplements: s.supplements.map((x) => ({ ...x, taken: false })),
  };
}

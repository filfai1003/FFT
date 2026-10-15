import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What the Android home screen widgets show (DECISIONS 51). The app writes it whenever the data
 * changes (WidgetBridge); the widgets only read it, so they never open the database and they work
 * with the app closed. A snapshot of an earlier day shows that day's totals as empty.
 */
export type WidgetSnapshot = {
  /** Local day the values belong to. */
  day: string;
  calories: {
    eaten: number;
    target: number | null;
    macros: { key: 'protein' | 'carbs' | 'fat'; eaten: number; target: number | null }[];
  };
  water: { ml: number; glassMl: number; goalGlasses: number };
  workout: { kind: 'next' | 'done' | 'none'; name: string | null; exercises: number };
  weight: { kg: number | null; change7: number | null; day: string | null };
  supplements: { name: string; taken: boolean }[];
};

export const WIDGET_NAMES = ['Calories', 'Workout', 'Water', 'Weight', 'Supplements'] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];

const KEY = 'fft.widgets.snapshot';

export async function readSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WidgetSnapshot) : null;
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
    water: { ...s.water, ml: 0 },
    workout: s.workout.kind === 'done' ? { kind: 'none', name: null, exercises: 0 } : s.workout,
    supplements: s.supplements.map((x) => ({ ...x, taken: false })),
  };
}

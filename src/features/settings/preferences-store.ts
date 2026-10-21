import { create } from 'zustand';
import type { WeightUnit } from '@/domain/units';

/** Units, theme, language and notification choices (Settings screen). */
export type NotificationPrefs = {
  rest_timer: boolean;
  workout_reminder: boolean;
  weekly_check_in: boolean;
  meals: boolean;
  /** Smart reminders (DECISIONS 122): a water nudge, and the weekly summary on the week's last day. */
  water: boolean;
  weekly_summary: boolean;
};

export type Preferences = {
  weightUnit: WeightUnit;
  lengthUnit: 'cm' | 'ft_in';
  energyUnit: 'kcal' | 'kj';
  weekStart: 'mon' | 'sun';
  /** Theme of the app. */
  theme: 'dark' | 'light' | 'system';
  /** Theme of the workout in progress (it can differ from the app's). */
  workoutTheme: 'dark' | 'light' | 'system';
  language: string;
  waterGlassMl: number;
  /** 1.25 kg (2.5 lb) plates: smaller steps for the next weight suggestion. */
  smallPlates: boolean;
  notifications: NotificationPrefs;
};

export const defaultPreferences: Preferences = {
  weightUnit: 'kg',
  lengthUnit: 'cm',
  energyUnit: 'kcal',
  weekStart: 'mon',
  theme: 'light',
  workoutTheme: 'light',
  language: 'en',
  waterGlassMl: 250,
  smallPlates: false,
  notifications: {
    rest_timer: true,
    workout_reminder: true,
    weekly_check_in: true,
    meals: false,
    water: false,
    weekly_summary: true,
  },
};

type Actions = {
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  replace: (prefs: Preferences) => void;
};

export const usePreferencesStore = create<Preferences & Actions>((set) => ({
  ...defaultPreferences,
  set: (key, value) => set({ [key]: value } as Partial<Preferences>),
  replace: (prefs) => set(prefs),
}));

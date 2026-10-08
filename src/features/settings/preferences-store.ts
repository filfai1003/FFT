import { create } from 'zustand';
import type { WeightUnit } from '@/domain/units';

/** Units, theme, language and notification choices (Settings screen). */
export type NotificationPrefs = {
  rest_timer: boolean;
  workout_reminder: boolean;
  weekly_check_in: boolean;
  meals: boolean;
};

export type Preferences = {
  weightUnit: WeightUnit;
  lengthUnit: 'cm' | 'ft_in';
  energyUnit: 'kcal' | 'kj';
  weekStart: 'mon' | 'sun';
  theme: 'dark' | 'light' | 'system';
  language: string;
  waterGlassMl: number;
  notifications: NotificationPrefs;
};

export const defaultPreferences: Preferences = {
  weightUnit: 'kg',
  lengthUnit: 'cm',
  energyUnit: 'kcal',
  weekStart: 'mon',
  theme: 'dark',
  language: 'en',
  waterGlassMl: 250,
  notifications: { rest_timer: true, workout_reminder: true, weekly_check_in: true, meals: false },
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

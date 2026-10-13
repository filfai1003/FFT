import { defaultAppearance, type AppearanceState } from '@/design/appearance-store';
import type { AccentName } from '@/design/tokens';
import type { Row, Update } from '@/types/db';
import { defaultPreferences, type Preferences } from './preferences-store';

type SettingsRow = Row<'user_settings'>;

/** user_settings row -> the two client stores. */
export function rowToState(row: SettingsRow): {
  appearance: AppearanceState;
  prefs: Preferences;
} {
  const n = (row.notifications ?? {}) as Partial<Preferences['notifications']>;
  return {
    appearance: {
      accent: row.accent as AccentName,
      textScaleStep: row.text_scale,
      boldText: row.bold_text,
      dotNumbers: row.dot_numbers,
      highContrast: row.high_contrast,
      reduceMotion: row.reduce_motion,
      haptics: row.haptics,
      oneHandMode: row.one_hand_mode,
      spokenCountdown: row.spoken_countdown,
    },
    prefs: {
      weightUnit: row.weight_unit as Preferences['weightUnit'],
      lengthUnit: row.length_unit as Preferences['lengthUnit'],
      energyUnit: row.energy_unit as Preferences['energyUnit'],
      weekStart: row.week_start as Preferences['weekStart'],
      // Rows saved before the themes existed (no workout_theme) start on the new default, light.
      theme: row.workout_theme ? (row.theme as Preferences['theme']) : 'light',
      workoutTheme: (row.workout_theme ?? 'light') as Preferences['workoutTheme'],
      language: row.language,
      waterGlassMl: row.water_glass_ml,
      notifications: { ...defaultPreferences.notifications, ...n },
    },
  };
}

/** The two client stores -> columns to save in user_settings. */
export function stateToRow(
  appearance: AppearanceState,
  prefs: Preferences,
): Update<'user_settings'> {
  return {
    accent: appearance.accent,
    text_scale: appearance.textScaleStep,
    bold_text: appearance.boldText,
    dot_numbers: appearance.dotNumbers,
    high_contrast: appearance.highContrast,
    reduce_motion: appearance.reduceMotion,
    haptics: appearance.haptics,
    one_hand_mode: appearance.oneHandMode,
    spoken_countdown: appearance.spokenCountdown,
    weight_unit: prefs.weightUnit,
    length_unit: prefs.lengthUnit,
    energy_unit: prefs.energyUnit,
    week_start: prefs.weekStart,
    theme: prefs.theme,
    workout_theme: prefs.workoutTheme,
    language: prefs.language,
    water_glass_ml: prefs.waterGlassMl,
    notifications: prefs.notifications,
  };
}

export { defaultAppearance, defaultPreferences };

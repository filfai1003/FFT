import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { usePlanStore } from '@/lib/plan';
import { useAppearanceStore } from './appearance-store';
import { effectiveAreaColors } from './area-colors';
import { useOsReduceMotion, watchOsReduceMotion } from './os-motion';
import { buildTheme, resolveMode, textScaleFor } from './theme';

/** Which theme setting a part of the app follows: the app's, the workout's, or always dark. */
export type ThemeScope = 'app' | 'workout' | 'dark';
const ScopeContext = createContext<ThemeScope>('app');

/** Everything inside follows the workout theme (the workout in progress). */
export function WorkoutThemeScope({ children }: { children: ReactNode }) {
  return createElement(ScopeContext.Provider, { value: 'workout' }, children);
}

/** Everything inside is dark whatever the settings (camera screens drawn on black). */
export function DarkThemeScope({ children }: { children: ReactNode }) {
  return createElement(ScopeContext.Provider, { value: 'dark' }, children);
}

/** Light or dark for the current scope ('system' follows the phone). */
export function useThemeMode() {
  const scope = useContext(ScopeContext);
  const setting = usePreferencesStore((s) => (scope === 'workout' ? s.workoutTheme : s.theme));
  const scheme = useColorScheme();
  if (scope === 'dark') return 'dark';
  return resolveMode(setting, scheme === 'dark' || scheme === 'light' ? scheme : null);
}

export function useTheme() {
  const mode = useThemeMode();
  const accent = useAppearanceStore((s) => s.accent);
  const highContrast = useAppearanceStore((s) => s.highContrast);
  const textScaleStep = useAppearanceStore((s) => s.textScaleStep);
  const boldText = useAppearanceStore((s) => s.boldText);
  const dotNumbers = useAppearanceStore((s) => s.dotNumbers);
  watchOsReduceMotion();
  // The app's setting or the phone's: either one turns movement off.
  const reduceMotionSetting = useAppearanceStore((s) => s.reduceMotion);
  const osReduceMotion = useOsReduceMotion((s) => s.value);
  const reduceMotion = reduceMotionSetting || osReduceMotion;
  const oneHandMode = useAppearanceStore((s) => s.oneHandMode);
  const areaChoice = useAppearanceStore((s) => s.areaColors);
  // Supporter and Premium only (DECISIONS 118): back on Free the defaults return, the choice stays.
  const plan = usePlanStore((s) => s.plan);
  const areas = useMemo(() => effectiveAreaColors(areaChoice, plan), [areaChoice, plan]);

  return useMemo(
    () => ({
      mode,
      colors: buildTheme({ accent, highContrast, mode, areas }),
      textScale: textScaleFor(textScaleStep),
      boldText,
      dotNumbers,
      reduceMotion,
      oneHandMode,
    }),
    [
      mode,
      accent,
      highContrast,
      areas,
      textScaleStep,
      boldText,
      dotNumbers,
      reduceMotion,
      oneHandMode,
    ],
  );
}

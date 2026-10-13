import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useAppearanceStore } from './appearance-store';
import { buildTheme, resolveMode, textScaleFor } from './theme';

/** Which theme setting a part of the app follows: the app's, or the workout's. */
export type ThemeScope = 'app' | 'workout';
const ScopeContext = createContext<ThemeScope>('app');

/** Everything inside follows the workout theme (the workout in progress). */
export function WorkoutThemeScope({ children }: { children: ReactNode }) {
  return createElement(ScopeContext.Provider, { value: 'workout' }, children);
}

/** Light or dark for the current scope ('system' follows the phone). */
export function useThemeMode() {
  const scope = useContext(ScopeContext);
  const setting = usePreferencesStore((s) => (scope === 'workout' ? s.workoutTheme : s.theme));
  const scheme = useColorScheme();
  return resolveMode(setting, scheme === 'dark' || scheme === 'light' ? scheme : null);
}

export function useTheme() {
  const mode = useThemeMode();
  const accent = useAppearanceStore((s) => s.accent);
  const highContrast = useAppearanceStore((s) => s.highContrast);
  const textScaleStep = useAppearanceStore((s) => s.textScaleStep);
  const boldText = useAppearanceStore((s) => s.boldText);
  const dotNumbers = useAppearanceStore((s) => s.dotNumbers);
  const reduceMotion = useAppearanceStore((s) => s.reduceMotion);
  const oneHandMode = useAppearanceStore((s) => s.oneHandMode);

  return useMemo(
    () => ({
      mode,
      colors: buildTheme({ accent, highContrast, mode }),
      textScale: textScaleFor(textScaleStep),
      boldText,
      dotNumbers,
      reduceMotion,
      oneHandMode,
    }),
    [mode, accent, highContrast, textScaleStep, boldText, dotNumbers, reduceMotion, oneHandMode],
  );
}

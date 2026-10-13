import { readableOn } from './contrast';
import { accentOptions, monoAccentDark, palettes, type AccentName, type ThemeMode } from './tokens';

/** Text-size steps of the Accessibility screen ("Text size 3 of 5"; step 3 = 1x). */
export const textScaleSteps = [0.85, 0.925, 1, 1.15, 1.3] as const;
export const defaultTextScaleStep = 3;

/** A theme setting: a fixed mode or the phone's. */
export type ThemeSetting = ThemeMode | 'system';

export type ThemeOptions = { accent: AccentName; highContrast: boolean; mode?: ThemeMode };

const highContrastOverrides = {
  light: {
    textMuted: '#4E4B46',
    textPlaceholderIcon: '#5E5A54',
    borderDecorative: '#B9B5AE',
    borderControl: '#5E5A54',
    divider: '#CFCAC2',
  },
  dark: {
    textMuted: '#D0CCC5',
    textPlaceholderIcon: '#B9B5AE',
    borderDecorative: '#5A5752',
    borderControl: '#A8A49D',
    divider: '#4A4844',
  },
} as const;

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : { [P in keyof T[K]]: string } };
export type ThemeColors = Widen<Omit<(typeof palettes)['light'], 'accentDefault'>> & {
  accent: string;
  /** Text/icon colour that stays readable on top of the accent. */
  onAccent: string;
};

export function accentColor(accent: AccentName, mode: ThemeMode): string {
  return accent === 'white' && mode === 'dark' ? monoAccentDark : accentOptions[accent];
}

export function buildTheme({ accent, highContrast, mode = 'light' }: ThemeOptions): ThemeColors {
  const { accentDefault: _accentDefault, ...base } = palettes[mode];
  const a = accentColor(accent, mode);
  return {
    ...base,
    ...(highContrast ? highContrastOverrides[mode] : {}),
    accent: a,
    onAccent: readableOn(a, '#FFFFFF', '#191917'),
  };
}

/** The mode a setting resolves to, given the phone's current scheme. */
export function resolveMode(
  setting: ThemeSetting,
  system: ThemeMode | null | undefined,
): ThemeMode {
  return setting === 'system' ? (system ?? 'light') : setting;
}

export function textScaleFor(step: number): number {
  const i = Math.min(Math.max(Math.round(step), 1), textScaleSteps.length) - 1;
  return textScaleSteps[i];
}

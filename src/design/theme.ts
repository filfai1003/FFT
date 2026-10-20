import { readableOn } from './contrast';
import { defaultAreaColors, type AreaColors } from './area-colors';
import {
  accentOptions,
  areaFamilies,
  monoAccentDark,
  palettes,
  type AccentName,
  type ThemeMode,
} from './tokens';

/** Text-size steps of the Accessibility screen ("Text size 3 of 5"; step 3 = 1x). */
export const textScaleSteps = [0.85, 0.925, 1, 1.15, 1.3] as const;
export const defaultTextScaleStep = 3;

/** A theme setting: a fixed mode or the phone's. */
export type ThemeSetting = ThemeMode | 'system';

export type ThemeOptions = {
  accent: AccentName;
  highContrast: boolean;
  mode?: ThemeMode;
  /** The hue of each area of the colour code (DECISIONS 118); the defaults of 107 when left out. */
  areas?: AreaColors;
};

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

/** The colours of the three areas for a mode (high contrast darkens a fill under 3:1). */
export function areaPalette(areas: AreaColors, mode: ThemeMode, highContrast: boolean) {
  const family = (area: keyof AreaColors) => {
    const f = areaFamilies[areas[area]][mode];
    return { ...f, main: (highContrast && f.mainHighContrast) || f.main };
  };
  const training = family('training');
  const nutrition = family('nutrition');
  const streak = family('streak');
  return {
    training: training.main,
    trainingSoft: training.soft,
    trainingInk: training.ink,
    nutrition: nutrition.main,
    nutritionSoft: nutrition.soft,
    nutritionInk: nutrition.ink,
    streak: streak.main,
    streakSoft: streak.soft,
    streakInk: streak.ink,
    // Calendar dots follow their areas: workouts = training, diet and supplements = nutrition.
    track: { workout: training.main, diet: nutrition.main, supplement: nutrition.main },
  };
}

export function buildTheme({
  accent,
  highContrast,
  mode = 'light',
  areas = defaultAreaColors,
}: ThemeOptions): ThemeColors {
  const { accentDefault: _accentDefault, ...base } = palettes[mode];
  const a = accentColor(accent, mode);
  return {
    ...base,
    ...(highContrast ? highContrastOverrides[mode] : {}),
    ...areaPalette(areas, mode, highContrast),
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

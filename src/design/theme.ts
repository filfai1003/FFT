import { accentOptions, color, type AccentName } from './tokens';

/** Text-size steps of the Accessibility screen ("Text size 3 of 5"; step 3 = 1x). */
export const textScaleSteps = [0.85, 0.925, 1, 1.15, 1.3] as const;
export const defaultTextScaleStep = 3;

export type ThemeOptions = { accent: AccentName; highContrast: boolean };

const highContrastOverrides = {
  textMuted: '#C4C4C4',
  textPlaceholderIcon: '#A0A0A0',
  borderDecorative: '#5A5A5A',
  borderControl: '#9A9A9A',
  divider: '#5A5A5A',
  dotOff: '#4A4A4A',
  chartDotOff: '#3A3A3A',
} as const;

export type ThemeColors = Omit<typeof color, 'accentDefault'> & { accent: string };

export function buildTheme({ accent, highContrast }: ThemeOptions): ThemeColors {
  const { accentDefault: _accentDefault, ...base } = color;
  return {
    ...base,
    ...(highContrast ? highContrastOverrides : {}),
    accent: accentOptions[accent],
  };
}

export function textScaleFor(step: number): number {
  const i = Math.min(Math.max(Math.round(step), 1), textScaleSteps.length) - 1;
  return textScaleSteps[i];
}

/** Design tokens. Mirror of docs/design/tokens.json (a test keeps them in sync). */

/** Accent choices. `white` is the "mono" accent: near-black on the light theme, near-white on dark. */
export const accentOptions = {
  red: '#D71921',
  orange: '#E85D1F',
  yellow: '#F2C94C',
  green: '#1F9D63',
  blue: '#2F6FE4',
  white: '#191917',
} as const;

export type AccentName = keyof typeof accentOptions;
export type ThemeMode = 'light' | 'dark';

/** The mono accent on the dark theme. */
export const monoAccentDark = '#F4F3F0';

const light = {
  bg: '#F6F5F2',
  surface: '#FFFFFF',
  surfaceAlt: '#F1EFEA',
  surfaceSelected: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  borderDecorative: '#E7E4DE',
  borderControl: '#8A867F',
  borderSelected: '#191917',
  divider: '#EFEDE8',
  text: '#191917',
  textMuted: '#67645E',
  textPlaceholderIcon: '#7A766F',
  /** Filled part of progress bars and charts. */
  dotOn: '#191917',
  /** Empty part (track) of progress bars. */
  dotOff: '#EFEDE8',
  chartDotOff: '#E7E4DE',
  danger: '#B3261E',
  success: '#1F9D63',
  successText: '#1A7F51',
  successSoft: '#DDF1E7',
  warning: '#E8890C',
  warningText: '#9A5800',
  warningSoft: '#FBEBD3',
  water: '#6FA2F0',
  waterSoft: '#E9F1FD',
  exerciseBorder: '#E7E4DE',
  exerciseBorderEmpty: '#C9C4BC',
  accentDefault: accentOptions.red,
  macroSplit: { protein: '#2F6FE4', carbs: '#E8890C', fat: '#1F9D63' },
  macroSoft: { protein: '#E4ECFB', carbs: '#FBEBD3', fat: '#DDF1E7' },
  overlay: 'rgba(25,25,23,0.45)',
} as const;

type Palette = {
  [K in keyof typeof light]: (typeof light)[K] extends string
    ? string
    : { [P in keyof (typeof light)[K]]: string };
};

const dark: Palette = {
  bg: '#111110',
  surface: '#1D1C1A',
  surfaceAlt: '#181715',
  surfaceSelected: '#262522',
  surfaceRaised: '#2A2926',
  borderDecorative: '#2E2C29',
  borderControl: '#7F7B74',
  borderSelected: '#F4F3F0',
  divider: '#2A2926',
  text: '#F4F3F0',
  textMuted: '#A8A49D',
  textPlaceholderIcon: '#8E8A83',
  dotOn: '#F4F3F0',
  dotOff: '#2E2C29',
  chartDotOff: '#2A2926',
  danger: '#FF8A80',
  success: '#3DBE84',
  successText: '#5AD39B',
  successSoft: '#16251D',
  warning: '#F0A23B',
  warningText: '#F0B45C',
  warningSoft: '#2B2114',
  water: '#5B8DEF',
  waterSoft: '#1B2638',
  exerciseBorder: '#3A3835',
  exerciseBorderEmpty: '#5A5752',
  accentDefault: accentOptions.red,
  macroSplit: { protein: '#5B8DEF', carbs: '#F0A23B', fat: '#3DBE84' },
  macroSoft: { protein: '#1B2638', carbs: '#2B2114', fat: '#16251D' },
  overlay: 'rgba(0,0,0,0.6)',
};

export const palettes: Record<ThemeMode, Palette> = { light, dark };

/** The light palette (the default theme). Components read colours through useTheme(), never this. */
export const color = light;

export const fontFamily = {
  display: 'Figtree_600SemiBold',
  label: 'Figtree_600SemiBold',
  labelBold: 'Figtree_700Bold',
  body: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
  bodySemiBold: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
} as const;

export const typeScale = {
  displayXL: { size: 64, lineHeight: 1 },
  displayL: { size: 40, lineHeight: 1.1 },
  screenTitle: { size: 28, lineHeight: 1.15 },
  displayM: { size: 30, lineHeight: 1.1 },
  displayS: { size: 20, lineHeight: 1.2 },
  titleM: { size: 17, lineHeight: 1.3 },
  bodyL: { size: 17, lineHeight: 1.4 },
  body: { size: 15, lineHeight: 1.4 },
  bodyS: { size: 13, lineHeight: 1.45 },
  label: { size: 12, lineHeight: 1.3, letterSpacing: 0 },
} as const;

export const minFontSize = 12;
export const inputFontSize = 16;

export const radius = {
  card: 20,
  cardSmall: 16,
  row: 14,
  input: 12,
  pill: 999,
  tile: 10,
} as const;

export const space = { screenX: 16, gapS: 8, gapM: 10, gapL: 14, gapXL: 18 } as const;

export const touch = {
  minTarget: 44,
  primaryButtonHeight: 52,
  secondaryButtonHeight: 48,
  listRowMin: 52,
  checkButton: 48,
} as const;

export const bars = {
  tabBarHeight: 62,
  tabBarPaddingTop: 6,
  bottomActionBarPaddingY: 12,
} as const;

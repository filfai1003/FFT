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
  // Darker than the fill so it stays >= 4.5:1 on successSoft too (StatusChip "better", DECISIONS 115).
  successText: '#15744A',
  successSoft: '#DDF1E7',
  warning: '#E8890C',
  warningText: '#9A5800',
  warningSoft: '#FBEBD3',
  /** Water: the palette's sky blue (same as the fat macro), its soft fill and the ink on it. */
  water: '#1EA0DC',
  waterSoft: '#DDF1FB',
  waterInk: '#0B6390',
  exerciseBorder: '#E7E4DE',
  exerciseBorderEmpty: '#C9C4BC',
  accentDefault: accentOptions.red,
  macroSplit: { protein: '#E5177E', carbs: '#F2C200', fat: '#1EA0DC' },
  /** Calendar dots: training, nutrition, supplements (always with a shape too, never colour alone). */
  track: { workout: '#5B3CC4', diet: '#0F9488', supplement: '#0F9488' },
  macroSoft: { protein: '#FCE1EE', carbs: '#FDF4CC', fat: '#DDF1FB' },
  /** Text on a macro's soft colour. */
  macroInk: { protein: '#A10F58', carbs: '#6E5600', fat: '#0B6390' },
  /**
   * Colour code (DECISIONS 107): one colour per area, for icon tiles, chips, bars and rings.
   * Training purple, nutrition teal, streak and achievements orange. Better = success (green),
   * worse = danger (red); everything else stays text colour and surfaceAlt.
   */
  training: '#5B3CC4',
  trainingSoft: '#ECE7FA',
  trainingInk: '#4527A0',
  nutrition: '#0F9488',
  nutritionSoft: '#D6F1EE',
  nutritionInk: '#0B6B63',
  streak: '#E8890C',
  streakSoft: '#FBEBD3',
  streakInk: '#9A5800',
  dangerSoft: '#FBE4E2',
  /** A disabled filled button: neutral fill (never a faded accent) and its label (>= 4.5:1). */
  disabledSurface: '#E9E7E2',
  disabledText: '#5E5A54',
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
  surfaceRaised: '#3A3834',
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
  water: '#4CB8EA',
  waterSoft: '#12293A',
  waterInk: '#7FCCF0',
  exerciseBorder: '#3A3835',
  exerciseBorderEmpty: '#5A5752',
  accentDefault: accentOptions.red,
  macroSplit: { protein: '#F2579E', carbs: '#F5CE3A', fat: '#4CB8EA' },
  track: { workout: '#9D86F0', diet: '#2DC2B4', supplement: '#2DC2B4' },
  macroSoft: { protein: '#3A1628', carbs: '#332B0E', fat: '#12293A' },
  macroInk: { protein: '#F48BBE', carbs: '#F5D66A', fat: '#7FCCF0' },
  training: '#9D86F0',
  trainingSoft: '#241D3A',
  trainingInk: '#B9A8F5',
  nutrition: '#2DC2B4',
  nutritionSoft: '#11302D',
  nutritionInk: '#5ED6CA',
  streak: '#F0A23B',
  streakSoft: '#2B2114',
  streakInk: '#F0B45C',
  dangerSoft: '#3A1A18',
  disabledSurface: '#2A2926',
  disabledText: '#A8A49D',
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

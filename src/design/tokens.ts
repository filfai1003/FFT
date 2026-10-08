/** Design tokens. Mirror of docs/design/tokens.json (a test keeps them in sync). */

export const accentOptions = {
  red: '#D71921',
  orange: '#FF5A1F',
  yellow: '#F2C94C',
  green: '#3DDC84',
  blue: '#4D8CFF',
  white: '#FFFFFF',
} as const;

export type AccentName = keyof typeof accentOptions;

export const color = {
  bg: '#000000',
  dotGrid: { dot: '#1C1C1C', dotSize: 1, spacing: 14 },
  surface: '#111111',
  surfaceAlt: '#0D0D0D',
  surfaceSelected: '#161616',
  surfaceRaised: '#1C1C1C',
  borderDecorative: '#262626',
  borderControl: '#6E6E6E',
  borderSelected: '#F2F2F2',
  divider: '#262626',
  text: '#F2F2F2',
  textMuted: '#8E8E8E',
  textPlaceholderIcon: '#666666',
  dotOn: '#F2F2F2',
  dotOff: '#2A2A2A',
  chartDotOff: '#222222',
  danger: '#FF6B6B',
  // From the ExerciseIcon mockup (not listed in tokens.json)
  exerciseBorder: '#333333',
  exerciseBorderEmpty: '#444444',
  accentDefault: accentOptions.red,
  macroSplit: { protein: '#F2F2F2', carbs: '#8E8E8E', fat: '#666666' },
  overlay: 'rgba(0,0,0,0.6)',
} as const;

export const fontFamily = {
  display: 'Doto_800ExtraBold',
  label: 'SpaceMono_400Regular',
  labelBold: 'SpaceMono_700Bold',
  body: 'SpaceGrotesk_400Regular',
  bodyMedium: 'SpaceGrotesk_500Medium',
  bodySemiBold: 'SpaceGrotesk_600SemiBold',
  bodyBold: 'SpaceGrotesk_700Bold',
} as const;

export const typeScale = {
  displayXL: { size: 76, lineHeight: 0.9 },
  displayL: { size: 48, lineHeight: 1 },
  screenTitle: { size: 40, lineHeight: 1 },
  displayM: { size: 32, lineHeight: 1 },
  displayS: { size: 22, lineHeight: 1 },
  titleM: { size: 20, lineHeight: 1.2 },
  bodyL: { size: 17, lineHeight: 1.4 },
  body: { size: 15, lineHeight: 1.4 },
  bodyS: { size: 13, lineHeight: 1.45 },
  label: { size: 11, lineHeight: 1.3, letterSpacing: 0.12 },
} as const;

export const minFontSize = 11;
export const inputFontSize = 16;

export const radius = {
  card: 24,
  cardSmall: 20,
  row: 16,
  input: 14,
  pill: 999,
  tile: 12,
} as const;

export const space = { screenX: 20, gapS: 8, gapM: 10, gapL: 14, gapXL: 18 } as const;

export const touch = {
  minTarget: 44,
  primaryButtonHeight: 56,
  secondaryButtonHeight: 48,
  listRowMin: 52,
  checkButton: 52,
} as const;

export const bars = {
  tabBarHeight: 52,
  tabBarPaddingTop: 6,
  bottomActionBarPaddingY: 12,
} as const;

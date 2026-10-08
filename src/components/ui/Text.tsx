import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { resolveTextStyle, type TextVariant } from '@/design/text-style';
import { useTheme } from '@/design/use-theme';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  /** Number text: uses plain digits when "Dot-matrix numbers" is off. */
  numeric?: boolean;
  medium?: boolean;
  muted?: boolean;
  /** Overrides the colour with the accent. Use sparingly: never for body text. */
  accent?: boolean;
};

export function Text({
  variant = 'body',
  numeric,
  medium,
  muted,
  accent,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const resolved = resolveTextStyle({
    variant,
    scale: theme.textScale,
    boldText: theme.boldText,
    dotNumbers: theme.dotNumbers,
    numeric,
    medium,
  });
  const color = accent ? theme.colors.accent : muted ? theme.colors.textMuted : theme.colors.text;
  return <RNText maxFontSizeMultiplier={1.5} {...rest} style={[resolved, { color }, style]} />;
}

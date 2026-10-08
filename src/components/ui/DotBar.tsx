import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/design/use-theme';

export type DotBarProps = {
  /** Total number of dots (calories 30–40, macros 10, rest timer ~24). */
  total: number;
  /** Lit dots, from the left. */
  on: number;
  /**
   * `dot` = fixed round dots that wrap (calories, macros, water).
   * `segment` = flexible thin pills that fill the width (rest timer, session progress).
   */
  shape?: 'dot' | 'segment';
  size?: number;
  gap?: number;
  /** Unlit dots: filled dark (default) or just an outline (water). */
  off?: 'fill' | 'outline';
  /** One lit dot painted with the accent, e.g. the exercise in progress. */
  accentIndex?: number;
  /** Screen-reader description, e.g. "Calories". Values are read as `on of total`. */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

/** The signature progress bar of the app: a row of dots. Never the only carrier of a value. */
export function DotBar({
  total,
  on,
  shape = 'dot',
  size = shape === 'dot' ? 6 : 4,
  gap = shape === 'dot' ? 4 : 3,
  off = 'fill',
  accentIndex,
  accessibilityLabel,
  style,
}: DotBarProps) {
  const { colors } = useTheme();
  const lit = Math.max(0, Math.min(total, Math.round(on)));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: total, now: lit }}
      style={[{ flexDirection: 'row', flexWrap: shape === 'dot' ? 'wrap' : 'nowrap', gap }, style]}
    >
      {Array.from({ length: total }, (_, i) => {
        const isOn = i < lit;
        const background = !isOn
          ? off === 'outline'
            ? 'transparent'
            : colors.dotOff
          : i === accentIndex
            ? colors.accent
            : colors.dotOn;
        return (
          <View
            key={i}
            style={{
              ...(shape === 'dot' ? { width: size, height: size } : { flex: 1, height: size }),
              borderRadius: size / 2,
              backgroundColor: background,
              ...(!isOn && off === 'outline'
                ? { borderWidth: 1, borderColor: colors.borderControl }
                : null),
            }}
          />
        );
      })}
    </View>
  );
}

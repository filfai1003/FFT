import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/design/use-theme';

export type DotBarProps = {
  /** The whole (e.g. 30 = the target). */
  total: number;
  /** The part that is filled, from the left. */
  on: number;
  /**
   * `dot` = one continuous bar filled from the left (calories, macros, water).
   * `segment` = equal pills, one per step (rest timer, session progress).
   */
  shape?: 'dot' | 'segment';
  /** Bar height. */
  size?: number;
  gap?: number;
  /** Kept for compatibility: an empty bar is always the track colour. */
  off?: 'fill' | 'outline';
  /** One segment painted with the accent, e.g. the exercise in progress. */
  accentIndex?: number;
  /** Fill colour (default: the text colour). */
  color?: string;
  /** Track colour (default: the theme's track). */
  track?: string;
  /** Screen-reader description, e.g. "Calories". Values are read as `on of total`. */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

/** Progress shown as a fill. Never the only carrier of a value: a number is always next to it. */
export function DotBar({
  total,
  on,
  shape = 'dot',
  size = shape === 'dot' ? 8 : 5,
  gap = 3,
  accentIndex,
  color,
  track,
  accessibilityLabel,
  style,
}: DotBarProps) {
  const { colors } = useTheme();
  const fill = color ?? colors.dotOn;
  const empty = track ?? colors.dotOff;
  const lit = Math.max(0, Math.min(total, on));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: total, now: Math.round(lit) }}
      style={[shape === 'segment' ? { flexDirection: 'row', gap } : null, style]}
    >
      {shape === 'dot' ? (
        <View
          style={{
            height: size,
            borderRadius: size / 2,
            backgroundColor: empty,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${total > 0 ? (lit / total) * 100 : 0}%`,
              height: size,
              borderRadius: size / 2,
              backgroundColor: fill,
            }}
          />
        </View>
      ) : (
        Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: size,
              borderRadius: size / 2,
              backgroundColor:
                i < Math.round(lit) ? (i === accentIndex ? colors.accent : fill) : empty,
            }}
          />
        ))
      )}
    </View>
  );
}

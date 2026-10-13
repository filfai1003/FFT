import { View, type StyleProp, type ViewStyle } from 'react-native';
import { columnLevels } from '@/domain/dots';
import { useTheme } from '@/design/use-theme';
import { Text } from './Text';

export type DotColumnChartProps = {
  /** One value per column (e.g. per week). */
  values: readonly number[];
  /** Value mapped to the shortest / tallest column. Defaults to the data range. */
  min?: number;
  max?: number;
  /** Dots in the tallest column (8–10). */
  rows?: number;
  dotSize?: number;
  columnGap?: number;
  dotGap?: number;
  /** Small caption under each column (the value, a week number…). */
  labels?: readonly string[];
  /** Columns share the full width instead of being as narrow as their dots. */
  stretch?: boolean;
  /** Text alternative, e.g. "Strength rising steadily over 12 weeks". */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

/** Bar chart with rounded columns, one per data point (the name stays from the dot-matrix era). */
export function DotColumnChart({
  values,
  min = Math.min(...values),
  max = Math.max(...values),
  rows = 8,
  dotSize = 6,
  columnGap = 4,
  dotGap = 2,
  labels,
  stretch = false,
  accessibilityLabel,
  style,
}: DotColumnChartProps) {
  const { colors } = useTheme();
  const levels = columnLevels(values, min, max, rows);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: columnGap }, style]}
    >
      {levels.map((level, c) => (
        <View
          key={c}
          style={{
            flexDirection: 'column',
            alignItems: 'center',
            gap: dotGap,
            ...(stretch ? { flex: 1 } : null),
          }}
        >
          <View
            style={{
              width: stretch ? '100%' : Math.max(dotSize * 2, 10),
              height: rows * (dotSize + dotGap),
              borderRadius: 6,
              backgroundColor: colors.chartDotOff,
              justifyContent: 'flex-end',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: `${(level / rows) * 100}%`,
                borderRadius: 6,
                backgroundColor: colors.dotOn,
              }}
            />
          </View>
          {labels ? (
            <Text variant="label" muted style={{ marginTop: 4 }}>
              {labels[c]}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

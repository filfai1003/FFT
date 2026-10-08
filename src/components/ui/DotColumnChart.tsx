import { View, type StyleProp, type ViewStyle } from 'react-native';
import { columnLevels } from '@/domain/dots';
import { useTheme } from '@/design/use-theme';

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
  /** Text alternative, e.g. "Strength rising steadily over 12 weeks". */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

/** Bar chart made of stacked dots, one column per data point. */
export function DotColumnChart({
  values,
  min = Math.min(...values),
  max = Math.max(...values),
  rows = 8,
  dotSize = 6,
  columnGap = 4,
  dotGap = 2,
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
        <View key={c} style={{ flexDirection: 'column', gap: dotGap }}>
          {Array.from({ length: rows }, (_, r) => (
            <View
              key={r}
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                // r = 0 is the top row; the bottom `level` rows are lit
                backgroundColor: r >= rows - level ? colors.dotOn : colors.chartDotOff,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

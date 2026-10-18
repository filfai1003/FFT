import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/design/use-theme';

/**
 * A small line of values over time (weight, body fat), oldest first, with the last point marked.
 * It fills the width it is given. The numbers around it carry the meaning.
 */
export function Sparkline({
  values,
  height = 48,
  color,
  fill,
  accessibilityLabel,
}: {
  values: readonly number[];
  height?: number;
  color?: string;
  /** Optional soft area under the line. */
  fill?: string;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const stroke = color ?? colors.text;
  const pad = 5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts =
    values.length > 1 && width > 0
      ? values.map((v, i) => [
          pad + (i / (values.length - 1)) * (width - pad * 2),
          pad + (1 - (v - min) / span) * (height - pad * 2),
        ])
      : [];
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = pts.at(-1);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height, alignSelf: 'stretch' }}
    >
      {last ? (
        <Svg width={width} height={height}>
          {fill ? (
            <Path
              d={`${line} L${last[0].toFixed(1)} ${height} L${pts[0]![0].toFixed(1)} ${height} Z`}
              fill={fill}
            />
          ) : null}
          <Path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={last[0]} cy={last[1]} r={4} fill={stroke} />
        </Svg>
      ) : null}
    </View>
  );
}

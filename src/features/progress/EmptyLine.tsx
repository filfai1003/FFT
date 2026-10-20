import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/design/use-theme';

/**
 * Where a line chart will be, before there is one (DECISIONS 114): a dashed, gently sloping line
 * in the control border colour, so an empty card looks like the full card not filled in yet.
 * With `start` the first value is already there (a filled dot at the left); the rest is to come.
 * Decoration only: the text beside it says what is missing.
 */
export function EmptyLine({ height = 44, start = false }: { height?: number; start?: boolean }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const pad = 5;
  const w = Math.max(0, width - pad * 2);
  const y = (share: number) => pad + share * (height - pad * 2);
  // A soft S from the upper left to the lower right: reads as "a trend goes here".
  const d =
    w > 0
      ? `M${pad} ${y(0.35)} C${pad + w * 0.3} ${y(0.2)}, ${pad + w * 0.55} ${y(0.75)}, ${
          pad + w
        } ${y(0.6)}`
      : '';
  return (
    <View
      aria-hidden
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height, alignSelf: 'stretch' }}
    >
      {d ? (
        <Svg width={width} height={height}>
          <Path
            d={d}
            fill="none"
            stroke={colors.borderControl}
            strokeWidth={2}
            strokeDasharray="4 6"
            strokeLinecap="round"
          />
          <Circle
            cx={pad}
            cy={y(0.35)}
            r={4}
            fill={start ? colors.text : colors.surface}
            stroke={start ? colors.text : colors.borderControl}
            strokeWidth={start ? 0 : 1.5}
          />
        </Svg>
      ) : null}
    </View>
  );
}

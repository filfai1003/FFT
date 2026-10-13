import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/design/use-theme';

type ArcProps = {
  /** 0..1 of the arc that is filled (values over 1 show a full arc). */
  value: number;
  size: number;
  stroke: number;
  color?: string;
  track?: string;
  /** Part of the circle the arc covers: 0.75 = a gauge open at the bottom, 1 = a full ring. */
  sweep?: number;
  /** Shown in the middle (the number). */
  children?: ReactNode;
  /** Text alternative ("1,440 kcal left of 2,600"). */
  accessibilityLabel: string;
};

/** A progress arc (calories) or ring (macros, timers). The number in the middle carries the value. */
export function Gauge({
  value,
  size,
  stroke,
  color,
  track,
  sweep = 1,
  children,
  accessibilityLabel,
}: ArcProps) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = c * sweep;
  const filled = arc * Math.max(0, Math.min(1, value));
  // A gauge opens at the bottom: start at 90° + half the gap.
  const rotation = sweep >= 1 ? -90 : 90 + ((1 - sweep) * 360) / 2;
  const height =
    sweep >= 1
      ? size
      : Math.round(
          size * (0.5 + 0.5 * Math.sin((Math.PI * (sweep * 360 - 180)) / 360)) + stroke / 2,
        );

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: Math.min(size, height) }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track ?? colors.dotOff}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${c}`}
          transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
        />
        {filled > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color ?? colors.dotOn}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${c}`}
            transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}

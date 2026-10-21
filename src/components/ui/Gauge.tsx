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
  /**
   * The filled part split in coloured pieces (the macros of what was eaten), in order. Their
   * shares add up to 1; the whole filled part is still `value`.
   */
  segments?: readonly { share: number; color: string }[];
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
  segments,
  children,
  accessibilityLabel,
}: ArcProps) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = c * sweep;
  const filled = arc * Math.max(0, Math.min(1, value));
  // A ring (nearly) full: round ends would overlap across the small gap and dent it, so the ends
  // are cut square instead.
  const closing = sweep >= 1 && arc - filled < stroke;
  const ringCap = closing ? 'butt' : 'round';
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
        {filled > 0 && segments?.length
          ? segments.map((seg, i) => {
              const start = segments.slice(0, i).reduce((a, x) => a + x.share, 0) * filled;
              const len = seg.share * filled;
              if (len <= 0) return null;
              return (
                <Circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${len} ${c}`}
                  strokeDashoffset={-start}
                  transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
                />
              );
            })
          : null}
        {/* The pieces meet edge to edge (butt ends), so the track's round ends would show grey at
            both ends of the fill: a tiny round dot in the first and last piece's colour covers them. */}
        {filled > 0 && segments?.length
          ? (() => {
              const shown = segments.filter((s) => s.share > 0);
              if (shown.length === 0 || closing) return null;
              const dot = Math.min(0.01, filled / 2);
              // Very little filled: two round ends of different colours would overlap as two
              // blobs, so one round piece in the biggest share's colour covers the whole fill.
              const caps =
                filled < 2 * stroke
                  ? [
                      {
                        at: 0,
                        len: filled,
                        color: shown.reduce((a, b) => (b.share > a.share ? b : a)).color,
                      },
                    ]
                  : [
                      { at: 0, len: dot, color: shown[0]!.color },
                      { at: filled - dot, len: dot, color: shown[shown.length - 1]!.color },
                    ];
              return caps.map((cap, i) => (
                <Circle
                  key={`cap${i}`}
                  testID={`gauge-cap-${i}`}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={cap.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${cap.len} ${c}`}
                  strokeDashoffset={-cap.at}
                  transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
                />
              ));
            })()
          : null}
        {filled > 0 && !segments?.length ? (
          <Circle
            testID="gauge-fill"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color ?? colors.dotOn}
            strokeWidth={stroke}
            strokeLinecap={ringCap}
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

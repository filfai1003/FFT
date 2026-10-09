import { useEffect, useId, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { color } from '@/design/tokens';

const { spacing } = color.dotGrid;
const native = Platform.OS !== 'web';

// A cosine sampled at 9 points: the animation library draws a smooth curve through them.
const COS = [1, 0.707, 0, -0.707, -1, -0.707, 0, 0.707, 1];
const AT = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

/** Moves between -amount and +amount and back, smoothly, forever. */
function useSway(durationMs: number, amount: number, phase: number) {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: native,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [value, durationMs]);
  const shifted = COS.map((_, i) => COS[(i + Math.round(phase * 8)) % 8]! * amount);
  return value.interpolate({ inputRange: AT, outputRange: shifted });
}

/**
 * A soft light that drifts slowly over the dot grid: under it the dots are bigger and brighter, and
 * they settle back to the faint grid around it. The bright dots are drawn once; a black veil with a
 * soft round opening is the only thing that moves, and moving it costs the phone almost nothing
 * (no redraw, no per-dot work).
 */
export default function DriftingLight({ width, height }: { width: number; height: number }) {
  const id = useId().replace(/:/g, '');
  const open = Math.min(width, height) * 0.66; // radius where the light has faded out
  const half = Math.hypot(width, height); // the veil covers the screen from any place of the opening
  const x = useSway(26000, width * 0.32, 0);
  const y = useSway(37000, height * 0.3, 0.25);
  const breathe = useSway(9000, 0.12, 0);

  return (
    <>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} aria-hidden>
        <Defs>
          <Pattern id={`${id}b`} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
            <Circle cx={spacing / 2} cy={spacing / 2} r={1.9} fill="#8C8C8C" />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${id}b)`} />
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: width / 2 - half,
          top: height / 2 - half,
          width: half * 2,
          height: half * 2,
          transform: [{ translateX: x }, { translateY: y }, { scale: Animated.add(1, breathe) }],
        }}
      >
        <Svg width={half * 2} height={half * 2} aria-hidden>
          <Defs>
            <RadialGradient id={`${id}v`} cx="50%" cy="50%" r="50%">
              <Stop offset={0} stopColor="#000" stopOpacity={0} />
              <Stop offset={(open * 0.12) / half} stopColor="#000" stopOpacity={0} />
              <Stop offset={(open * 0.4) / half} stopColor="#000" stopOpacity={0.3} />
              <Stop offset={(open * 0.7) / half} stopColor="#000" stopOpacity={0.75} />
              <Stop offset={open / half} stopColor="#000" stopOpacity={1} />
              <Stop offset={1} stopColor="#000" stopOpacity={1} />
            </RadialGradient>
          </Defs>
          <Rect width={half * 2} height={half * 2} fill={`url(#${id}v)`} />
        </Svg>
      </Animated.View>
    </>
  );
}

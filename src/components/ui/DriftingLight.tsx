import { useEffect, useId, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { color } from '@/design/tokens';

const { spacing } = color.dotGrid;
const native = Platform.OS !== 'web';

// Black, clear in the middle, opaque towards the edges (tools/make-veil.js): a small picture the GPU stretches.
const veil = require('../../../assets/images/veil.png');

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
        <Image
          source={veil}
          resizeMode="stretch"
          style={{ width: half * 2, height: half * 2 }}
          accessible={false}
        />
      </Animated.View>
    </>
  );
}

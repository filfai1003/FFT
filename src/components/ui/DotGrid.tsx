import { memo, useEffect, useId, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { useBackground } from '@/design/background-store';
import { color } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';

const { dot, spacing } = color.dotGrid;
const WAVE_MS = 5600;
const native = Platform.OS !== 'web';

/** The faint 1px dot grid behind every screen. Decorative: hidden from screen readers. */
function StaticDots({ id }: { id: string }) {
  return (
    <>
      <Defs>
        <Pattern id={id} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <Circle cx={spacing / 2} cy={spacing / 2} r={0.75} fill={dot} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </>
  );
}

// One ring of bigger dots, drawn once (a few hundred circles) and then only scaled and faded by the
// GPU: nothing is redrawn per frame, so it stays smooth on phones.
const REF = 320; // size of the ring picture
const RING_R = 118; // middle of the ring in the picture
const RING_HALF = 30; // half of its thickness
const GRID = 7;
const ringDots = (() => {
  const dots: { x: number; y: number; o: number }[] = [];
  for (let y = GRID / 2; y < REF; y += GRID) {
    for (let x = GRID / 2; x < REF; x += GRID) {
      const d = Math.hypot(x - REF / 2, y - REF / 2);
      const k = 1 - Math.abs(d - RING_R) / RING_HALF;
      if (k > 0.05) dots.push({ x, y, o: Math.min(1, k * 1.2) });
    }
  }
  return dots;
})();

const RingPicture = memo(function RingPicture() {
  return (
    <Svg width={REF} height={REF} aria-hidden>
      {ringDots.map((d, i) => (
        <Circle key={i} cx={d.x} cy={d.y} r={1.15} fill="#8C8C8C" opacity={d.o} />
      ))}
    </Svg>
  );
});

/** A ripple: the ring grows from a point to the screen edge, fading out, and starts again. */
function Ripple({ x, y, reach, delay }: { x: number; y: number; reach: number; delay: number }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: WAVE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: native,
        }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, delay]);

  const maxScale = reach / RING_R;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - REF / 2,
        top: y - REF / 2,
        width: REF,
        height: REF,
        opacity: progress.interpolate({
          inputRange: [0, 0.04, 0.3, 0.6, 1],
          outputRange: [0, 1, 0.55, 0.18, 0],
        }),
        transform: [
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.12, maxScale] }) },
        ],
      }}
    >
      <RingPicture />
    </Animated.View>
  );
}

/** Background of every screen, in the mode chosen in Settings (black, dots, or dots with waves). */
export function DotGrid() {
  const id = useId().replace(/:/g, '');
  const { reduceMotion } = useTheme();
  const { mode, loaded, load } = useBackground();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const animate = mode === 'waves' && !reduceMotion && size.width > 0;

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  if (mode === 'black') return null;
  const reach = Math.max(size.width, size.height) * 0.95;
  return (
    <View
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      pointerEvents="none"
      onLayout={(e) => setSize(e.nativeEvent.layout)}
    >
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        aria-hidden
      >
        <StaticDots id={id} />
      </Svg>
      {animate ? (
        <>
          <Ripple x={size.width * 0.3} y={size.height * 0.22} reach={reach} delay={0} />
          <Ripple x={size.width * 0.78} y={size.height * 0.7} reach={reach} delay={WAVE_MS / 2} />
        </>
      ) : null}
    </View>
  );
}

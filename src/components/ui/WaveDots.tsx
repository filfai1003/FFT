import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { color } from '@/design/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const { spacing } = color.dotGrid;
const WAVE_MS = 5600;
const BASE_R = 0.75; // a resting dot of the grid
const BIG_R = 2.7; // a dot at the crest of a wave
const HALF_WIDTH = 85; // half of the width of the wave, in px
const STEPS = 110; // the wave is redrawn this many times per run (about 20 per second)
const FILLS = ['#3A3A3A', '#686868', '#8C8C8C'] as const;

/**
 * The waves: dots of the grid grow when a wave reaches them and shrink back as it passes. Every dot
 * stays where it is; only the dots near a wave change, and they are drawn as three paths (dim,
 * medium, bright) that the UI thread rebuilds about 20 times a second, with no React work.
 */
export default function WaveDots({ width, height }: { width: number; height: number }) {
  const geometry = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let y = spacing / 2; y < height; y += spacing)
      for (let x = spacing / 2; x < width; x += spacing) {
        xs.push(x);
        ys.push(y);
      }
    const origins = [
      { x: width * 0.3, y: height * 0.22 },
      { x: width * 0.78, y: height * 0.7 },
    ];
    const distances = origins.map((o) => xs.map((x, i) => Math.hypot(x - o.x, ys[i]! - o.y)));
    return { xs, ys, distances, reach: Math.max(width, height) * 0.95 };
  }, [width, height]);

  const first = useSharedValue(0);
  const second = useSharedValue(0);
  const lastStep = useSharedValue(-1);
  const cache = useSharedValue<string[]>(['M0 0', 'M0 0', 'M0 0']);

  useEffect(() => {
    const run = () =>
      withRepeat(withTiming(1, { duration: WAVE_MS, easing: Easing.out(Easing.quad) }), -1, false);
    first.value = run();
    second.value = withDelay(WAVE_MS / 2, run());
  }, [first, second]);

  const paths = useDerivedValue(() => {
    'worklet';
    const step = Math.floor(first.value * STEPS) * 1000 + Math.floor(second.value * STEPS);
    if (step === lastStep.value) return cache.value;
    lastStep.value = step;

    const { xs, ys, distances, reach } = geometry;
    const out = ['', '', ''];
    const progress = [first.value, second.value];
    for (let w = 0; w < 2; w++) {
      const p = progress[w]!;
      // Fades in at the start, thins out as it travels.
      const strength = Math.pow(1 - p, 1.4) * Math.min(1, p / 0.04);
      if (strength < 0.02) continue;
      const crest = p * reach;
      const d = distances[w]!;
      for (let i = 0; i < d.length; i++) {
        const e = (d[i]! - crest) / HALF_WIDTH;
        if (e <= -1 || e >= 1) continue;
        const level = 0.5 * (1 + Math.cos(Math.PI * e)) * strength;
        if (level < 0.12) continue;
        const r = BASE_R + (BIG_R - BASE_R) * level;
        const bucket = level < 0.4 ? 0 : level < 0.75 ? 1 : 2;
        const rr = r.toFixed(2);
        out[bucket] +=
          `M${(xs[i]! - r).toFixed(1)} ${ys[i]!}` +
          `a${rr} ${rr} 0 1 0 ${(2 * r).toFixed(2)} 0` +
          `a${rr} ${rr} 0 1 0 ${(-2 * r).toFixed(2)} 0`;
      }
    }
    const next = out.map((s) => (s === '' ? 'M0 0' : s));
    cache.value = next;
    return next;
  });

  const dim = useAnimatedProps(() => ({ d: paths.value[0] }));
  const mid = useAnimatedProps(() => ({ d: paths.value[1] }));
  const bright = useAnimatedProps(() => ({ d: paths.value[2] }));

  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      aria-hidden
    >
      <AnimatedPath animatedProps={dim} fill={FILLS[0]} />
      <AnimatedPath animatedProps={mid} fill={FILLS[1]} />
      <AnimatedPath animatedProps={bright} fill={FILLS[2]} />
    </Svg>
  );
}

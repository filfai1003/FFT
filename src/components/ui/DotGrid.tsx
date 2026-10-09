import { memo, useEffect, useId, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { useBackground } from '@/design/background-store';
import { color } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';

const { dot, spacing } = color.dotGrid;
const WAVE_MS = 5600;
const native = Platform.OS !== 'web';

/**
 * The dot grid at a given size, faint (1px dots) or big and bright: an SVG pattern, drawn once.
 */
const Grid = memo(function Grid({
  id,
  width,
  height,
  big,
}: {
  id: string;
  width?: number;
  height?: number;
  big?: boolean;
}) {
  return (
    <Svg
      width={width ?? '100%'}
      height={height ?? '100%'}
      style={width == null ? StyleSheet.absoluteFill : undefined}
      pointerEvents="none"
      aria-hidden
    >
      <Defs>
        <Pattern id={id} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <Circle
            cx={spacing / 2}
            cy={spacing / 2}
            r={big ? 2.4 : 0.75}
            fill={big ? '#8C8C8C' : dot}
          />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
});

const R0 = 100; // radius of the round window at scale 1

/**
 * One ring of a wave: a round window that grows (scale) showing the big dots of the grid, with a black
 * disc in its middle hiding them, so only a ring of dots shows. The dots stay on the grid (the picture
 * inside is scaled back by the inverse), the GPU only moves the window: no redraw, smooth on phones.
 */
function RingLayer({
  id,
  x,
  y,
  width,
  height,
  scale,
  counter,
  opacity,
  inner,
}: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: Animated.AnimatedNode;
  counter: Animated.AnimatedNode;
  opacity: Animated.AnimatedNode;
  /** Radius of the hidden middle, as a part of the window's radius. */
  inner: number;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - R0,
        top: y - R0,
        width: R0 * 2,
        height: R0 * 2,
        borderRadius: R0,
        overflow: 'hidden',
        opacity: opacity as unknown as number,
        transform: [{ scale: scale as unknown as number }],
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          left: R0 - x,
          top: R0 - y,
          width,
          height,
          transformOrigin: `${x}px ${y}px`,
          transform: [{ scale: counter as unknown as number }],
        }}
      >
        <Grid id={id} width={width} height={height} big />
      </Animated.View>
      <View
        style={{
          position: 'absolute',
          left: R0 - R0 * inner,
          top: R0 - R0 * inner,
          width: R0 * inner * 2,
          height: R0 * inner * 2,
          borderRadius: R0 * inner,
          backgroundColor: color.bg,
        }}
      />
    </Animated.View>
  );
}

/** A wave from one point: the ring grows to the screen edge while it fades, then starts again. */
function Wave({
  id,
  x,
  y,
  width,
  height,
  delay,
}: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  delay: number;
}) {
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

  const reach = Math.max(width, height) * 0.95;
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.12, reach / R0] });
  const counter = Animated.divide(1, scale);
  const fade = (peak: number) =>
    progress.interpolate({
      inputRange: [0, 0.04, 0.3, 0.6, 1],
      outputRange: [0, peak, peak * 0.55, peak * 0.18, 0],
    });
  return (
    <RingLayer
      id={id}
      x={x}
      y={y}
      width={width}
      height={height}
      scale={scale}
      counter={counter}
      opacity={fade(0.9)}
      inner={0.68}
    />
  );
}

/** Background of every screen    </>
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
  const { width, height } = size;
  return (
    <View
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      pointerEvents="none"
      onLayout={(e) => setSize(e.nativeEvent.layout)}
    >
      {animate ? (
        <>
          <Wave
            id={`${id}1`}
            x={width * 0.3}
            y={height * 0.22}
            width={width}
            height={height}
            delay={0}
          />
          <Wave
            id={`${id}2`}
            x={width * 0.78}
            y={height * 0.7}
            width={width}
            height={height}
            delay={WAVE_MS / 2}
          />
        </>
      ) : null}
      <Grid id={id} />
    </View>
  );
}

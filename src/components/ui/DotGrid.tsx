import { lazy, Suspense, useEffect, useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { useBackground } from '@/design/background-store';
import { color } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';

const { dot, spacing } = color.dotGrid;

// The waves need the animation library: it is loaded only when that mode is on.
const WaveDots = lazy(() => import('./WaveDots'));

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
        <Suspense fallback={null}>
          <WaveDots width={size.width} height={size.height} />
        </Suspense>
      ) : null}
    </View>
  );
}

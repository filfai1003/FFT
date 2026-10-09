import { useEffect, useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Mask, Pattern, Rect } from 'react-native-svg';
import { useBackground } from '@/design/background-store';
import { color } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';

const { dot, spacing } = color.dotGrid;
const WAVE_MS = 5600;
const RING = 96;

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

/** Bigger, brighter dots that only show inside a ring spreading out from a point, then fading. */
function Waves({
  id,
  width,
  height,
  now,
}: {
  id: string;
  width: number;
  height: number;
  now: number;
}) {
  const reach = Math.max(width, height) * 0.95;
  const origins = [
    { x: width * 0.3, y: height * 0.22, offset: 0 },
    { x: width * 0.78, y: height * 0.7, offset: WAVE_MS / 2 },
  ];
  return (
    <>
      <Defs>
        <Pattern id={`${id}-big`} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <Circle cx={spacing / 2} cy={spacing / 2} r={2.4} fill="#8C8C8C" />
        </Pattern>
        <Mask id={`${id}-mask`} x={0} y={0} width={width} height={height}>
          {origins.map((o, i) => {
            const p = ((now + o.offset) % WAVE_MS) / WAVE_MS;
            const fade = Math.pow(1 - p, 1.4);
            return (
              <G key={i}>
                <Circle
                  cx={o.x}
                  cy={o.y}
                  r={Math.max(1, p * reach)}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeOpacity={0.45 * fade}
                  strokeWidth={RING}
                />
                <Circle
                  cx={o.x}
                  cy={o.y}
                  r={Math.max(1, p * reach)}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeOpacity={fade}
                  strokeWidth={RING * 0.4}
                />
              </G>
            );
          })}
        </Mask>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${id}-big)`} mask={`url(#${id}-mask)`} />
    </>
  );
}

/** Background of every screen, in the mode chosen in Settings (black, dots, or dots with waves). */
export function DotGrid() {
  const id = useId().replace(/:/g, '');
  const { reduceMotion } = useTheme();
  const { mode, loaded, load } = useBackground();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [now, setNow] = useState(0);
  const animate = mode === 'waves' && !reduceMotion && size.width > 0;

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    let last = 0;
    const tick = (t: number) => {
      // About 30 frames a second is plenty for a slow ripple.
      if (t - last > 33) {
        last = t;
        setNow(t);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  if (mode === 'black') return null;
  return (
    <View
      style={StyleSheet.absoluteFill}
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
        {animate ? <Waves id={id} width={size.width} height={size.height} now={now} /> : null}
      </Svg>
    </View>
  );
}

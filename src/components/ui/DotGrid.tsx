import { Component, useEffect, useId, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { useBackground } from '@/design/background-store';
import { color } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import DriftingLight from './DriftingLight';

const { dot, spacing } = color.dotGrid;

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

/** If the waves fail to load or draw, the plain dots stay and the waves are marked as failed. */
class WaveBoundary extends Component<
  { children: ReactNode; onFail: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

let trialStarted = false;

/** The waves with their safety net: marked as being tried, and as fine a few seconds later. */
function GuardedWaves({ width, height }: { width: number; height: number }) {
  const setHealth = useBackground((s) => s.setHealth);
  useEffect(() => {
    if (trialStarted) return;
    trialStarted = true;
    setHealth('trying');
    // Not cleared on purpose: the trial is about this whole run of the app, not this screen.
    setTimeout(() => setHealth('ok'), 4000);
  }, [setHealth]);
  return (
    <WaveBoundary onFail={() => setHealth('failed')}>
      <DriftingLight width={width} height={height} />
    </WaveBoundary>
  );
}

/** Background of every screen, in the mode chosen in Settings (black, dots, or dots with waves). */
export function DotGrid() {
  const id = useId().replace(/:/g, '');
  const { reduceMotion } = useTheme();
  const { mode, health, loaded, load } = useBackground();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const animate =
    mode === 'waves' && health !== 'failed' && loaded && !reduceMotion && size.width > 0;

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
      {animate ? <GuardedWaves width={size.width} height={size.height} /> : null}
      {/* The faint grid is on top, so it stays visible outside the light too. */}
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        aria-hidden
      >
        <StaticDots id={id} />
      </Svg>
    </View>
  );
}

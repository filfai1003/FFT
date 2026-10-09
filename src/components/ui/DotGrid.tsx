import { useEffect, useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { useBackground } from '@/design/background-store';
import { color } from '@/design/tokens';

const { dot, spacing } = color.dotGrid;

/** The faint 1px dot grid behind every screen (or plain black, as chosen in Settings). Decorative. */
export function DotGrid() {
  const id = useId().replace(/:/g, '');
  const { mode, loaded, load } = useBackground();

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  if (mode === 'black') return null;
  return (
    <Svg
      width="100%"
      height="100%"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      aria-hidden
    >
      <Defs>
        <Pattern id={id} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <Circle cx={spacing / 2} cy={spacing / 2} r={0.75} fill={dot} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

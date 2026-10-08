import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { color } from '@/design/tokens';

const { dot, spacing } = color.dotGrid;

/** The faint 1px dot grid behind every screen. Decorative: hidden from screen readers. */
export function DotGrid() {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <Pattern id="dots" width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <Circle cx={spacing / 2} cy={spacing / 2} r={0.75} fill={dot} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#dots)" />
    </Svg>
  );
}

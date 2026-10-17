import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { toQR } from 'toqr';
import { palettes } from '@/design/tokens';

/**
 * A QR code (pure JS encoder, drawn with SVG). Always dark modules on a light ground, in both
 * themes: phone scanners do not all read inverted codes. `label` is what a screen reader says.
 */
export function QrCode({
  value,
  size = 220,
  label,
}: {
  value: string;
  size?: number;
  label: string;
}) {
  const { path, count } = useMemo(() => {
    const cells = toQR(value);
    const n = Math.round(Math.sqrt(cells.length));
    let d = '';
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) if (cells[y * n + x]) d += `M${x} ${y}h1v1h-1z`;
    return { path: d, count: n };
  }, [value]);
  // A quiet zone of 4 modules around the code, as the standard asks.
  const quiet = 4;
  const light = palettes.light;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ alignSelf: 'center', backgroundColor: light.surface, borderRadius: 8 }}
    >
      <Svg
        width={size}
        height={size}
        viewBox={`${-quiet} ${-quiet} ${count + quiet * 2} ${count + quiet * 2}`}
      >
        <Path d={path} fill={light.text} />
      </Svg>
    </View>
  );
}

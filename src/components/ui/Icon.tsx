import Svg, { Circle, Path } from 'react-native-svg';

type Shape = string | readonly [cx: number, cy: number, r: number];

/** Stroke icons on a 24px grid, 1.5 stroke, like the mockups. Add shapes as screens need them. */
const shapes = {
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  chevronLeft: ['M15 5l-7 7 7 7'],
  chevronRight: ['M9 5l7 7-7 7'],
  chevronDown: ['M5 9l7 7 7-7'],
  close: ['M6 6l12 12M18 6L6 18'],
  play: ['M8 5.5l11 6.5-11 6.5z'],
  bell: ['M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7', 'M10 20a2 2 0 0 0 4 0'],
  search: ['M20 20l-4-4', [11, 11, 6.5]],
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4'],
  // Tab bar
  today: [
    [12, 12, 4],
    'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  ],
  train: ['M3 9v6M21 9v6M6 6v12M18 6v12M6 12h12'],
  diet: ['M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 0-3 3-3 6s1 4 3 4v8'],
  progress: ['M4 20V10M10 20V4M16 20v-7M22 20H2'],
  profile: [[12, 8, 4], 'M4 21c1-4 4-6 8-6s7 2 8 6'],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof shapes;

export type IconProps = {
  name: IconName;
  size?: number;
  color: string;
};

/** Decorative: the control that holds it carries the accessible label. */
export function Icon({ name, size = 20, color }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {(shapes[name] as readonly Shape[]).map((shape) =>
        typeof shape === 'string' ? (
          <Path key={shape} d={shape} />
        ) : (
          <Circle key={shape.join()} cx={shape[0]} cy={shape[1]} r={shape[2]} />
        ),
      )}
    </Svg>
  );
}

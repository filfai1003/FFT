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
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  trash: ['M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13'],
  arrowUp: ['M12 19V5M6 11l6-6 6 6'],
  arrowDown: ['M12 5v14M6 13l6 6 6-6'],
  info: [[12, 12, 9], 'M12 11v5M12 8h.01'],
  calendar: ['M4 6h16v14H4zM4 10h16M8 3v4M16 3v4'],
  chat: ['M4 5h16v11H10l-4 4v-4H4z'],
  grip: ['M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01'],
  sliders: ['M4 7h9M19 7h1M4 17h1M11 17h9', [16, 7, 2.5], [8, 17, 2.5]],
  camera: ['M4 8h4l2-3h4l2 3h4v11H4z', [12, 13, 3.5]],
  scan: ['M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 8v8M12 8v8M16 8v8'],
  copy: ['M9 9h11v11H9z', 'M15 9V4H4v11h5'],
  code: ['M8.5 7l-5 5 5 5', 'M15.5 7l5 5-5 5', 'M13.5 4.5l-3 15'],
  archive: ['M3 5h18v4H3zM5 9v11h14V9M10 13h4'],
  lock: ['M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3'],
  swap: ['M7 4l-4 4 4 4M3 8h14M17 20l4-4-4-4M21 16H7'],
  home: ['M4 11l8-7 8 7', 'M6 9.5V20h12V9.5', 'M10 20v-5h4v5'],
  bowl: ['M3.5 11h17a8.5 8.5 0 0 1-17 0z', 'M9 4c0 2 1.6 2 1.6 4', 'M13.5 4c0 2 1.6 2 1.6 4'],
  dumbbell: ['M6.5 7v10', 'M17.5 7v10', 'M3.5 9.5v5', 'M20.5 9.5v5', 'M6.5 12h11'],
  chart: ['M4 19.5h16', 'M5 15l4.5-4.5 3.5 3 6-6.5'],
  sparkle: [
    'M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z',
    'M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  ],
  droplet: ['M12 3.5c3 4 6 7.3 6 10.8a6 6 0 0 1-12 0c0-3.5 3-6.8 6-10.8z'],
  scale: [
    'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
    'M8.5 10a5 5 0 0 1 7 0',
    'M12 10.5l1.2-2.5',
  ],
  barcode: ['M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12'],
  mic: ['M9 5.5a3 3 0 0 1 6 0V11a3 3 0 0 1-6 0z', 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5v3'],
  trophy: [
    'M8 4h8v5a4 4 0 0 1-8 0z',
    'M8 5.5H5a3 3 0 0 0 3.2 4',
    'M16 5.5h3a3 3 0 0 1-3.2 4',
    'M12 13v4M8.5 20h7',
  ],
  book: ['M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h10'],
  clock: [[12, 12, 8.5], 'M12 7.5V12l3 2'],
  eye: ['M2.5 12s3.8-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.8 6.5-9.5 6.5S2.5 12 2.5 12z', [12, 12, 3]],
  flame: ['M12 3c1 4 5.5 5.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-3 2-4.3 2.4-6.5 1.8 1 2.6 2.6 2.6 4.5'],
  skip: ['M6 6l9 6-9 6z', 'M18 6v12'],
  shield: ['M12 3l7 3v6c0 4-3 7.3-7 9-4-1.7-7-5-7-9V6z'],
  palette: [
    'M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z',
    [7.5, 11, 1],
    [10, 7, 1],
    [14.5, 7, 1],
    [17, 10.5, 1],
  ],
  download: ['M12 4v11', 'M7 10.5l5 5 5-5', 'M4.5 20h15'],
  list: ['M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01'],
  user: [[12, 8, 4], 'M4.5 20c1.4-3.5 4.2-5 7.5-5s6.1 1.5 7.5 5'],
  settings: [
    [12, 12, 3],
    'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  ],
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
      strokeWidth={1.8}
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

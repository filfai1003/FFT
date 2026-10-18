import Svg, { Circle, Path } from 'react-native-svg';

type Shape = string | readonly [cx: number, cy: number, r: number];

/**
 * Stroke icons on a 24px grid, 1.8 stroke: the same shapes as the canvas Icon component
 * ("FFT app (current)"). Add shapes as screens need them, copied from there.
 */
const shapes = {
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  chevronLeft: ['M14.5 6l-6 6 6 6'],
  chevronRight: ['M9.5 6l6 6-6 6'],
  chevronDown: ['M6 9.5l6 6 6-6'],
  close: ['M6.5 6.5l11 11M17.5 6.5l-11 11'],
  play: ['M8 5.5v13l10.5-6.5z'],
  bell: ['M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  search: ['M20 20l-4.3-4.3', [11, 11, 6.5]],
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 2.5-2.5L20 17', 'M15.5 9h.01'],
  more: ['M5.5 12h.01M12 12h.01M18.5 12h.01'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  trash: ['M4.5 7h15', 'M9.5 7V4.5h5V7', 'M6.5 7l1 13h9l1-13'],
  arrowUp: ['M12 19V5M6 11l6-6 6 6'],
  arrowDown: ['M12 5v14M6 13l6 6 6-6'],
  info: [[12, 12, 8.5], 'M12 11v5M12 8h.01'],
  calendar: ['M4.5 5.5h15v14h-15z', 'M4.5 10h15', 'M8.5 3.5v4', 'M15.5 3.5v4'],
  chat: ['M4 5h16v11H10l-4 4v-4H4z'],
  grip: ['M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01'],
  sliders: ['M4 7h9', 'M17 7h3', [15, 7, 2], 'M4 17h3', 'M11 17h9', [9, 17, 2]],
  camera: ['M4 8h3.2l1.8-2.5h6l1.8 2.5H20v11H4z', [12, 13, 3.3]],
  scan: ['M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 8v8M12 8v8M16 8v8'],
  copy: ['M8.5 8.5h11v11h-11z', 'M4.5 15.5v-11h11'],
  code: ['M8.5 7l-5 5 5 5', 'M15.5 7l5 5-5 5', 'M13.5 4.5l-3 15'],
  archive: ['M3 5h18v4H3zM5 9v11h14V9M10 13h4'],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  swap: ['M7.5 4l-3 3 3 3', 'M4.5 7h13', 'M16.5 20l3-3-3-3', 'M19.5 17h-13'],
  /** A cog: the way into Settings (the canvas "settings" glyph reads as a sun next to Look). */
  gear: [
    'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
    [12, 12, 3],
  ],
  medal: [[12, 15, 5], 'M8.5 3.5l2.2 6.8', 'M15.5 3.5l-2.2 6.8', 'M12 13v4'],
  heart: ['M12 19.5S4 15 4 9.5A4 4 0 0 1 12 8a4 4 0 0 1 8 1.5c0 5.5-8 10-8 10z'],
  logout: ['M14.5 4.5h4.5v15h-4.5', 'M10 8l-4 4 4 4', 'M6 12h10.5'],
  home: ['M4 11l8-7 8 7', 'M6 9.5V20h12V9.5', 'M10 20v-5h4v5'],
  bowl: ['M3.5 11h17a8.5 8.5 0 0 1-17 0z', 'M9 4c0 2 1.6 2 1.6 4', 'M13.5 4c0 2 1.6 2 1.6 4'],
  dumbbell: ['M6.5 7v10', 'M17.5 7v10', 'M3.5 9.5v5', 'M20.5 9.5v5', 'M6.5 12h11'],
  chart: ['M4 19.5h16', 'M5 15l4.5-4.5 3.5 3 6-6.5'],
  sparkle: [
    'M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z',
    'M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  ],
  droplet: ['M12 3.5c3 4 6 7.3 6 10.8a6 6 0 0 1-12 0c0-3.5 3-6.8 6-10.8z'],
  pill: [
    'M10.33 19.33L19.33 10.33A4 4 0 0 0 13.67 4.67L4.67 13.67A4 4 0 0 0 10.33 19.33z',
    'M9.17 9.17l5.66 5.66',
  ],
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
  /** Scanner torch: lit (beam lines) and off (crossed out), so the state is not colour alone. */
  flashlight: [
    'M7.5 8h9v1.5c0 1-1.5 1.8-1.5 3V20a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-7.5c0-1.2-1.5-2-1.5-3z',
    'M7.5 11h9',
    'M12 15v2',
    'M12 2.5v2.5M6.5 4l1.5 2M17.5 4L16 6',
  ],
  flashlightOff: [
    'M7.5 3.5h9v3c0 1-1.5 1.8-1.5 3V20a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V9.5c0-1.2-1.5-2-1.5-3z',
    'M7.5 6.5h9',
    'M4 4l16 16',
  ],
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
  // Gamification and community (canvas Icon: star, sun, globe, filter, qr, users).
  star: ['M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z'],
  sun: [
    [12, 12, 4],
    'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  ],
  globe: [
    [12, 12, 8.5],
    'M3.5 12h17',
    'M12 3.5c2.4 2.5 3.5 5.5 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.5-3.5-8.5s1.1-6 3.5-8.5z',
  ],
  filter: ['M4 6h16M7 12h10M10 18h4'],
  qr: [
    'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z',
    'M14 14h2.5v2.5H14zM18 18h2v2h-2z',
    'M14 19.5h1.5M19.5 14v1.5',
  ],
  users: [
    [9, 8, 3.5],
    'M2.5 19.5c1-3 3.5-4.5 6.5-4.5s5.5 1.5 6.5 4.5',
    'M15.5 4.8a3.5 3.5 0 0 1 0 6.4',
    'M18 14.8c1.7.7 2.9 2.1 3.5 4.2',
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
      // Dot glyphs need a heavier stroke to read as dots (same as the canvas).
      strokeWidth={name === 'more' || name === 'grip' ? 3 : 1.8}
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

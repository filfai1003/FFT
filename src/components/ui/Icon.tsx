import Svg, { Circle, Path } from 'react-native-svg';

/** Stroke icons on a 24px grid, 1.5 stroke, like the mockups. Add paths as screens need them. */
const paths = {
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  chevronLeft: ['M15 5l-7 7 7 7'],
  chevronRight: ['M9 5l7 7-7 7'],
  chevronDown: ['M5 9l7 7 7-7'],
  close: ['M6 6l12 12M18 6L6 18'],
  play: ['M8 5.5l11 6.5-11 6.5z'],
  bell: ['M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7', 'M10 20a2 2 0 0 0 4 0'],
  search: ['M20 20l-4-4'],
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4'],
} as const;

export type IconName = keyof typeof paths;

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
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {paths[name].map((d) => (
        <Path key={d} d={d} />
      ))}
      {name === 'search' ? <Circle cx={11} cy={11} r={6.5} /> : null}
    </Svg>
  );
}

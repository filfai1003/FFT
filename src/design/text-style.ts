import type { TextStyle } from 'react-native';
import { fontFamily, minFontSize, typeScale } from './tokens';

export type TextVariant = keyof typeof typeScale;

/** Big numbers and titles: semibold (titles bold), tabular digits so values do not jump. */
const displayVariants: readonly TextVariant[] = [
  'displayXL',
  'displayL',
  'screenTitle',
  'displayM',
  'displayS',
];

export type TextStyleOptions = {
  variant: TextVariant;
  /** App text-size multiplier from the Accessibility screen. */
  scale: number;
  boldText: boolean;
  /** Kept for compatibility with the old dot-matrix setting; no longer changes the font. */
  dotNumbers?: boolean;
  /** True when the text is a number: tabular digits. */
  numeric?: boolean;
  medium?: boolean;
  /** 600 weight for small headings ("Units", "Calories") in body sizes. */
  semibold?: boolean;
};

export function resolveTextStyle(o: TextStyleOptions): TextStyle {
  const def = typeScale[o.variant];
  const fontSize = Math.max(minFontSize, Math.round(def.size * o.scale));
  const lineHeight = Math.round(fontSize * def.lineHeight);
  const style: TextStyle = { fontSize, lineHeight };

  if (displayVariants.includes(o.variant)) {
    style.fontFamily =
      o.variant === 'screenTitle' || o.boldText ? fontFamily.bodyBold : fontFamily.display;
    if (fontSize >= 28) style.letterSpacing = -fontSize * 0.02;
  } else if (o.variant === 'label') {
    style.fontFamily = o.boldText ? fontFamily.labelBold : fontFamily.label;
  } else {
    const heavy = o.medium ?? o.variant === 'titleM';
    if (o.semibold) {
      style.fontFamily = o.boldText ? fontFamily.bodyBold : fontFamily.bodySemiBold;
    } else if (o.boldText) {
      style.fontFamily = heavy ? fontFamily.bodyBold : fontFamily.bodySemiBold;
    } else if (o.variant === 'titleM') {
      style.fontFamily = fontFamily.bodySemiBold;
    } else {
      style.fontFamily = heavy ? fontFamily.bodyMedium : fontFamily.body;
    }
  }
  if (o.numeric || displayVariants.includes(o.variant)) style.fontVariant = ['tabular-nums'];
  return style;
}

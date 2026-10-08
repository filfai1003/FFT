import type { TextStyle } from 'react-native';
import { fontFamily, minFontSize, typeScale } from './tokens';

export type TextVariant = keyof typeof typeScale;

/** Variants set in Doto (dot-matrix). Everything else is Space Grotesk, label is Space Mono. */
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
  dotNumbers: boolean;
  /** True when the text is a number: it falls back to plain digits if dot-matrix is off. */
  numeric?: boolean;
  medium?: boolean;
};

export function resolveTextStyle(o: TextStyleOptions): TextStyle {
  const def = typeScale[o.variant];
  const fontSize = Math.max(minFontSize, Math.round(def.size * o.scale));
  const lineHeight = Math.round(fontSize * def.lineHeight);
  const style: TextStyle = { fontSize, lineHeight };

  if (displayVariants.includes(o.variant)) {
    if (o.numeric && !o.dotNumbers) {
      style.fontFamily = o.boldText ? fontFamily.bodyBold : fontFamily.bodyMedium;
    } else {
      style.fontFamily = fontFamily.display;
    }
  } else if (o.variant === 'label') {
    style.fontFamily = o.boldText ? fontFamily.labelBold : fontFamily.label;
    style.letterSpacing = fontSize * typeScale.label.letterSpacing;
    style.textTransform = 'uppercase';
  } else {
    const heavy = o.medium ?? o.variant === 'titleM';
    if (o.boldText) {
      style.fontFamily = heavy ? fontFamily.bodyBold : fontFamily.bodySemiBold;
    } else {
      style.fontFamily = heavy ? fontFamily.bodyMedium : fontFamily.body;
    }
  }
  return style;
}

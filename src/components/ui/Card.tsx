import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { AnimatedPressable, usePressScale } from './motion';

export type CardProps = {
  children: ReactNode;
  /** `small` = tighter radius/padding for list rows; `alt` = the darker surface. */
  size?: 'default' | 'small';
  tone?: 'default' | 'alt';
  /** Selection is shown with a white border, never with a filled block. */
  selected?: boolean;
  gap?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  size = 'default',
  tone = 'default',
  selected = false,
  gap = 14,
  onPress,
  accessibilityLabel,
  style,
}: CardProps) {
  const { colors } = useTheme();
  const press = usePressScale(0.985);
  const base: ViewStyle = {
    backgroundColor: selected
      ? colors.surfaceSelected
      : tone === 'alt'
        ? colors.surfaceAlt
        : colors.surface,
    borderWidth: 1,
    borderColor: selected ? colors.borderSelected : colors.borderDecorative,
    borderRadius: size === 'small' ? radius.cardSmall : radius.card,
    padding: size === 'small' ? 16 : 20,
    gap,
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        base,
        { minHeight: touch.listRowMin, opacity: press.pressed ? 0.85 : 1 },
        style,
        press.style,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';

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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        base,
        { minHeight: touch.listRowMin, opacity: pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

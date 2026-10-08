import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';

export type IconButtonProps = {
  icon: IconName;
  /** Required: icon-only controls need a name for screen readers. */
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  /** Visual size, never below the 44px touch target. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  size = touch.minTarget,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();
  const box = Math.max(size, touch.minTarget);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        tick();
        onPress();
      }}
      style={({ pressed }) => [
        {
          width: box,
          height: box,
          borderRadius: box / 2,
          borderWidth: 1,
          borderColor: colors.borderControl,
          backgroundColor: colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} color={colors.text} />
    </Pressable>
  );
}

import { type StyleProp, type ViewStyle } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';
import { AnimatedPressable, usePressScale } from './motion';

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
  const press = usePressScale(0.92);
  const box = Math.max(size, touch.minTarget);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        tick();
        onPress();
      }}
      style={[
        {
          width: box,
          height: box,
          borderRadius: box / 2,
          borderWidth: 1,
          borderColor: colors.borderControl,
          backgroundColor: colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : press.pressed ? 0.85 : 1,
        },
        style,
        press.style,
      ]}
    >
      <Icon name={icon} color={colors.text} />
    </AnimatedPressable>
  );
}

import { type StyleProp, type ViewStyle } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';
import { AnimatedPressable, usePressScale } from './motion';
import { Text } from './Text';

export type ButtonVariant =
  /** The one accent-filled action of a screen. */
  | 'primary'
  /** Dashed outline, mono label: "+ ADD EXERCISE". */
  | 'secondary'
  /** Text row with a dashed top border, e.g. "TRAIN A DIFFERENT DAY". */
  | 'ghost'
  /** Destructive, outlined in the danger colour. Never pinned to the bottom bar. */
  | 'danger';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** `large` = 56px (bottom action bar); `medium` = 52px (inline). */
  size?: 'large' | 'medium';
  icon?: IconName;
  disabled?: boolean;
  /** Fills the width of its container. Default true. */
  block?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  icon,
  disabled = false,
  block = true,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const press = usePressScale();
  const large = size === 'large';
  const height = large ? touch.primaryButtonHeight : touch.secondaryButtonHeight + 4;

  const look = {
    primary: {
      container: { backgroundColor: colors.accent, borderRadius: height / 2 },
      fg: colors.onAccent,
    },
    secondary: {
      container: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.borderControl,
        borderRadius: height / 2,
      },
      fg: colors.text,
    },
    ghost: {
      container: {
        minHeight: touch.minTarget,
        height: undefined,
        borderTopWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.borderDecorative,
        justifyContent: 'space-between',
      },
      fg: colors.text,
    },
    danger: {
      container: {
        borderWidth: 1,
        borderColor: colors.danger,
        borderRadius: height / 2,
      },
      fg: colors.danger,
    },
  } as const satisfies Record<ButtonVariant, { container: ViewStyle; fg: string }>;

  const { container, fg } = look[variant];
  const mono = variant !== 'primary';

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
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
          height,
          minHeight: touch.minTarget,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 22,
          // Inline buttons sit in rows (or centred columns): centre them, never pin them to the top.
          alignSelf: block ? 'stretch' : 'center',
          opacity: disabled ? 0.4 : press.pressed ? 0.85 : 1,
        },
        container,
        style,
        press.style,
      ]}
    >
      {icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <Text
        variant={mono ? 'label' : large ? 'bodyL' : 'body'}
        medium
        style={{ color: fg, letterSpacing: mono ? 0.9 : 0 }}
      >
        {label}
      </Text>
      {variant === 'ghost' ? <Icon name="chevronRight" size={16} color={fg} /> : null}
    </AnimatedPressable>
  );
}

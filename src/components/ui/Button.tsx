import { type StyleProp, type ViewStyle } from 'react-native';
import { fontFamily, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';
import { AnimatedPressable, usePressScale } from './motion';
import { Text } from './Text';

export type ButtonVariant =
  /** The one accent-filled action of a screen. */
  | 'primary'
  /** Outlined, on the card colour: "Add exercise". */
  | 'secondary'
  /** Plain text button, e.g. "Train a different day". */
  | 'ghost'
  /** Destructive, outlined in the danger colour. Never pinned to the bottom bar. */
  | 'danger'
  /** Filled in the text colour (not the accent): a compact header action ("Check-in"). */
  | 'dark';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** `large` = 52px (bottom action bar); `medium` = 48px (inline); `small` = 44px pill (headers). */
  size?: 'large' | 'medium' | 'small';
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
  const small = size === 'small';
  const height = large
    ? touch.primaryButtonHeight
    : small
      ? touch.minTarget
      : touch.secondaryButtonHeight;
  const corner = small ? touch.minTarget / 2 : 14;

  const look = {
    primary: {
      container: { backgroundColor: colors.accent, borderRadius: corner },
      fg: colors.onAccent,
    },
    secondary: {
      container: {
        borderWidth: 1,
        borderColor: colors.borderControl,
        backgroundColor: colors.surface,
        borderRadius: corner,
      },
      fg: colors.text,
    },
    ghost: {
      container: {
        minHeight: touch.minTarget,
        height: undefined,
        paddingHorizontal: 8,
      },
      fg: colors.text,
    },
    danger: {
      container: {
        borderWidth: 1,
        borderColor: colors.borderDecorative,
        backgroundColor: colors.surface,
        borderRadius: corner,
      },
      fg: colors.danger,
    },
    dark: {
      container: { backgroundColor: colors.text, borderRadius: corner },
      fg: colors.bg,
    },
  } as const satisfies Record<ButtonVariant, { container: ViewStyle; fg: string }>;

  const { container, fg } = look[variant];

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
          gap: small ? 6 : 8,
          paddingHorizontal: small ? 14 : 22,
          // Inline buttons sit in rows (or centred columns): centre them, never pin them to the top.
          alignSelf: block ? 'stretch' : 'center',
          opacity: disabled ? 0.4 : press.pressed ? 0.85 : 1,
        },
        container,
        style,
        press.style,
      ]}
    >
      {icon ? <Icon name={icon} size={small ? 16 : 20} color={fg} /> : null}
      {/*
        One line: Android measures the semibold font a little short and wrapped the last word onto
        a second line that the button's fixed height cut off ("Add to ChatGPT" showed "Add to").
      */}
      <Text
        variant={large ? 'bodyL' : 'body'}
        numberOfLines={1}
        style={{ color: fg, fontFamily: fontFamily.bodySemiBold, flexShrink: 1 }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

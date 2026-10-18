import { createContext, useContext } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';
import { AnimatedPressable, pressFeedback, usePressScale } from './motion';

/**
 * `outline` = round white button with a hairline border (headers of the main pages, cards);
 * `plain` = the bare icon in a 44px target (top bar of pushed pages: back, close, more);
 * `soft` = filled with the soft surface, no border (add / start buttons inside cards and rows).
 */
export type IconButtonLook = 'outline' | 'plain' | 'soft';

/** Lets a container (the TopBar) switch the icon buttons inside it to its own look. */
export const IconButtonLookContext = createContext<IconButtonLook>('outline');

export type IconButtonProps = {
  icon: IconName;
  /** Required: icon-only controls need a name for screen readers. */
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  /** Visual size, never below the 44px touch target. */
  size?: number;
  look?: IconButtonLook;
  /** A toggle that is on: 2px border in the text colour and announced as selected. */
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  size = touch.minTarget,
  look,
  selected,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();
  const inherited = useContext(IconButtonLookContext);
  const kind = look ?? inherited;
  const plain = kind === 'plain';
  const soft = kind === 'soft';
  const press = usePressScale(pressFeedback.icon);
  const box = Math.max(size, touch.minTarget);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? { disabled } : { disabled, selected }}
      aria-disabled={disabled}
      aria-selected={selected}
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
          borderWidth: selected ? 2 : plain || soft ? 0 : 1,
          borderColor: selected ? colors.text : colors.borderDecorative,
          backgroundColor: plain
            ? press.pressed
              ? colors.surfaceAlt
              : 'transparent'
            : soft
              ? // The empty-track colour: a shade lighter than the card in dark, darker in light.
                colors.dotOff
              : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : press.opacity,
        },
        style,
        press.style,
      ]}
    >
      <Icon name={icon} size={plain ? 24 : 20} color={colors.text} />
    </AnimatedPressable>
  );
}

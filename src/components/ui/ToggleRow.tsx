import { View } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import type { IconName } from './Icon';
import { IconTile, type Area } from './IconTile';
import { AnimatedPressable, pressFeedback, usePressScale } from './motion';
import { Text } from './Text';
import { ToggleTrack } from './Toggle';

export type ToggleRowProps = {
  name: string;
  /** One muted line under the name: what "on" does. */
  detail?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /** Optional tile on the left, in an area's colour (Diet, Training…). */
  icon?: IconName;
  area?: Area;
  /** Hairline above the row (every row of a card but the first). */
  divider?: boolean;
};

/**
 * A settings row that is a switch as a whole: the name, a help line and the switch on the right.
 * The whole row toggles (a 56 px target instead of the 50×30 switch alone) and is one control for
 * screen readers (name, state, the help line as hint).
 */
export function ToggleRow({
  name,
  detail,
  value,
  onValueChange,
  disabled = false,
  icon,
  area = 'neutral',
  divider = false,
}: ToggleRowProps) {
  const { colors } = useTheme();
  const press = usePressScale(pressFeedback.surface);
  return (
    <AnimatedPressable
      accessibilityRole="switch"
      accessibilityLabel={name}
      accessibilityHint={detail}
      accessibilityState={disabled ? { checked: value, disabled } : { checked: value }}
      aria-checked={value}
      aria-disabled={disabled || undefined}
      disabled={disabled || undefined}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        tick();
        onValueChange(!value);
      }}
      style={[
        {
          minHeight: Math.max(56, touch.listRowMin),
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 8,
          borderTopWidth: divider ? 1 : 0,
          borderColor: colors.borderDecorative,
          opacity: disabled ? 0.45 : press.opacity,
        },
        press.style,
      ]}
    >
      {icon ? <IconTile icon={icon} area={area} size={36} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{name}</Text>
        {detail ? (
          <Text variant="bodyS" muted>
            {detail}
          </Text>
        ) : null}
      </View>
      <ToggleTrack value={value} />
    </AnimatedPressable>
  );
}

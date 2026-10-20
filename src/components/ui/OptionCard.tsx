import { View } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';
import { useAreaColors, type Area } from './IconTile';
import { AnimatedPressable, pressFeedback, usePressScale } from './motion';
import { Text } from './Text';

export type OptionCardProps = {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** `radio` (single choice, default) or `checkbox`. */
  role?: 'radio' | 'checkbox';
  /**
   * Optional glyph in a soft tile on the left (onboarding), in an area's colours (DECISIONS 107;
   * neutral by default). `tint` / `ink` still override them.
   */
  icon?: { name: IconName; area?: Area; tint?: string; ink?: string };
};

/**
 * Big selectable choice, as in the canvas: white card, selection = 2px border in the text colour
 * plus a check (never colour alone, never a filled block). A checkbox shows an empty box when off.
 */
export function OptionCard({
  title,
  description,
  selected,
  onPress,
  role = 'radio',
  icon,
}: OptionCardProps) {
  const { colors } = useTheme();
  const press = usePressScale(pressFeedback.surface);
  const area = useAreaColors(icon?.area ?? 'neutral');
  return (
    <AnimatedPressable
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={description ? `${title}. ${description}` : title}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        tick();
        onPress();
      }}
      style={[
        {
          minHeight: touch.listRowMin + 16,
          borderRadius: 18,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.borderSelected : colors.borderDecorative,
          backgroundColor: selected ? colors.surfaceSelected : colors.surface,
          // The 2px border takes its extra pixel from the padding, so nothing moves on selection.
          padding: selected ? 15 : 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          opacity: press.opacity,
        },
        press.style,
      ]}
    >
      {icon ? (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 15,
            backgroundColor: icon.tint ?? area.soft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon.name} size={22} color={icon.ink ?? area.ink} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="titleM">{title}</Text>
        {description ? (
          <Text variant="bodyS" muted>
            {description}
          </Text>
        ) : null}
      </View>
      {role === 'checkbox' ? (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: selected ? 0 : 1,
            borderColor: colors.borderControl,
            backgroundColor: selected ? colors.text : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? <Icon name="check" size={16} color={colors.bg} /> : null}
        </View>
      ) : selected ? (
        <Icon name="check" size={22} color={colors.text} />
      ) : null}
    </AnimatedPressable>
  );
}

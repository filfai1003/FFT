import { View } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Icon } from './Icon';
import { AnimatedPressable, usePressScale } from './motion';
import { Text } from './Text';

export type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** `radio` for single choice, `checkbox` for multi choice. */
  role?: 'radio' | 'checkbox';
};

/**
 * Selection is shown with a 2px border in the text colour and, for multi choice, a check before
 * the label (never the border alone). It sinks under the finger like every button (DECISIONS 110).
 */
export function Chip({ label, selected, onPress, role = 'checkbox' }: ChipProps) {
  const { colors } = useTheme();
  const press = usePressScale();
  const check = selected && role === 'checkbox';
  return (
    <AnimatedPressable
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={label}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        tick();
        onPress();
      }}
      style={[
        {
          height: touch.minTarget,
          // The 2px border takes its extra pixel from the padding, so nothing moves on selection.
          paddingHorizontal: selected ? 13 : 14,
          borderRadius: 22,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.borderSelected : colors.borderControl,
          backgroundColor: colors.surface,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          opacity: press.opacity,
        },
        press.style,
      ]}
    >
      {check ? (
        <View testID="chip-check" aria-hidden>
          <Icon name="check" size={16} color={colors.text} />
        </View>
      ) : null}
      <Text variant="body" medium={selected} style={{ fontSize: 14, color: colors.text }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

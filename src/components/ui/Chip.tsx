import { Pressable } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Text } from './Text';

export type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** `radio` for single choice, `checkbox` for multi choice. */
  role?: 'radio' | 'checkbox';
};

/** Selection is shown with a 2px border in the text colour. */
export function Chip({ label, selected, onPress, role = 'checkbox' }: ChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={label}
      onPress={() => {
        tick();
        onPress();
      }}
      style={({ pressed }) => ({
        height: touch.minTarget,
        paddingHorizontal: 14,
        borderRadius: 22,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.borderSelected : colors.borderControl,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text variant="body" medium={selected} style={{ fontSize: 14, color: colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

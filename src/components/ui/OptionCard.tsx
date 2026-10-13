import { Pressable, View } from 'react-native';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Text } from './Text';

export type OptionCardProps = {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** `radio` (single choice, default) or `checkbox`. */
  role?: 'radio' | 'checkbox';
};

/** Big selectable choice. Selection = white border (never a filled block). */
export function OptionCard({
  title,
  description,
  selected,
  onPress,
  role = 'radio',
}: OptionCardProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={description ? `${title}. ${description}` : title}
      onPress={() => {
        tick();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: touch.listRowMin + 16,
        borderRadius: radius.cardSmall,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.borderSelected : colors.borderDecorative,
        backgroundColor: selected ? colors.surfaceSelected : colors.surface,
        padding: 16,
        gap: 4,
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="titleM">{title}</Text>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: selected ? colors.borderSelected : colors.borderControl,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? (
            <View
              style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }}
            />
          ) : null}
        </View>
      </View>
      {description ? (
        <Text variant="bodyS" muted>
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}

import { Pressable, View } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Text } from './Text';

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/** Equal-width single choice (4 WK / 12 WK / 1 YR / ALL, kg / lb…). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        gap: 4,
        padding: 4,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: colors.borderDecorative,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            accessibilityLabel={o.label}
            onPress={() => {
              if (selected) return;
              tick();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              height: touch.minTarget,
              borderRadius: 22,
              borderWidth: selected ? 1 : 0,
              borderColor: colors.borderSelected,
              backgroundColor: selected ? colors.surfaceSelected : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="label" style={{ color: selected ? colors.text : colors.textMuted }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

import { Pressable, View } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Text } from './Text';

export type SegmentedOption<T extends string> = { value: T; label: string; disabled?: boolean };

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
        gap: 2,
        padding: 3,
        borderRadius: 12,
        backgroundColor: colors.dotOff,
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
            disabled={o.disabled}
            aria-disabled={o.disabled}
            onPress={() => {
              if (selected || o.disabled) return;
              tick();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              minHeight: touch.minTarget - 6,
              borderRadius: 10,
              backgroundColor: selected ? colors.surfaceRaised : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: o.disabled ? 0.35 : 1,
            }}
          >
            <Text
              variant="body"
              semibold={selected}
              medium={!selected}
              style={{ fontSize: 14, color: colors.text }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

import { Pressable, View } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';

export type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
};

/** 50×30. On = filled track (text colour), knob on the right; off = grey track, knob on the left. */
export function Toggle({ value, onValueChange, accessibilityLabel }: ToggleProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      aria-checked={value}
      // The visual is 50×30; the pressable area is 44px high.
      style={{ minWidth: touch.minTarget, minHeight: touch.minTarget, justifyContent: 'center' }}
      onPress={() => {
        tick();
        onValueChange(!value);
      }}
    >
      <View
        style={{
          width: 50,
          height: 30,
          borderRadius: 15,
          padding: 3,
          backgroundColor: value ? colors.text : colors.borderControl,
          justifyContent: 'center',
          alignItems: value ? 'flex-end' : 'flex-start',
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: value ? colors.bg : '#FFFFFF',
          }}
        />
      </View>
    </Pressable>
  );
}

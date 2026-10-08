import { Pressable, View } from 'react-native';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';

export type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
};

/** 44×26. On = light track + dark knob on the right; off = outlined track + knob on the left. */
export function Toggle({ value, onValueChange, accessibilityLabel }: ToggleProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      // The visual is 26px high; the touch area is extended to 44px.
      hitSlop={{ top: 9, bottom: 9, left: 4, right: 4 }}
      onPress={() => {
        tick();
        onValueChange(!value);
      }}
    >
      <View
        style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          padding: value ? 3 : 2,
          borderWidth: value ? 0 : 1,
          borderColor: colors.textMuted,
          backgroundColor: value ? colors.text : colors.bg,
          justifyContent: 'center',
          alignItems: value ? 'flex-end' : 'flex-start',
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: value ? colors.bg : colors.textMuted,
          }}
        />
      </View>
    </Pressable>
  );
}

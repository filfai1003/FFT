import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';

const native = Platform.OS !== 'web';
/** How far the knob travels: track 50 − knob 24 − padding 2 × 3. */
const TRAVEL = 20;

export type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  /** Cannot be changed now: the switch keeps its state, faded, and is announced as disabled. */
  disabled?: boolean;
};

/**
 * 50×30. On = filled track (text colour), knob on the right; off = grey track, knob on the left.
 * The knob slides (160 ms; at once with reduce motion), so the change reads at a glance.
 */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
}: ToggleProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled ? { checked: value, disabled } : { checked: value }}
      aria-checked={value}
      aria-disabled={disabled || undefined}
      // Only when disabled: a `false` would add `disabled: false` to the announced state.
      disabled={disabled || undefined}
      // The visual is 50×30; the pressable area is 44px high.
      style={{
        minWidth: touch.minTarget,
        minHeight: touch.minTarget,
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
      }}
      onPress={() => {
        tick();
        onValueChange(!value);
      }}
    >
      <ToggleTrack value={value} />
    </Pressable>
  );
}

/**
 * The switch drawn without its own touch target, for a row that is the switch as a whole
 * (`ToggleRow`): one control for screen readers, not two.
 */
export function ToggleTrack({ value }: { value: boolean }) {
  const { colors, reduceMotion } = useTheme();
  const [x] = useState(() => new Animated.Value(value ? TRAVEL : 0));
  useEffect(() => {
    const to = value ? TRAVEL : 0;
    if (reduceMotion) {
      x.setValue(to);
      return;
    }
    const anim = Animated.timing(x, {
      toValue: to,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: native,
    });
    anim.start();
    return () => anim.stop();
  }, [value, reduceMotion, x]);
  return (
    <Animated.View
      aria-hidden
      style={{
        width: 50,
        height: 30,
        borderRadius: 15,
        padding: 3,
        backgroundColor: value ? colors.text : colors.borderControl,
        justifyContent: 'center',
      }}
    >
      <Animated.View
        testID="toggle-knob"
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          // On: the page colour on the dark track; off: the card colour on the grey track.
          backgroundColor: value ? colors.bg : colors.surface,
          transform: [{ translateX: x }],
        }}
      />
    </Animated.View>
  );
}

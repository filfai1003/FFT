import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/design/use-theme';

const native = Platform.OS !== 'web';

/** A Pressable whose style can hold animated values (see usePressScale). */
export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Light press feedback: the control sinks a little under the finger. None with "reduce motion". */
export function usePressScale(amount = 0.97) {
  const { reduceMotion } = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);
  const to = (value: number) =>
    Animated.timing(scale, {
      toValue: value,
      duration: value === 1 ? 140 : 80,
      easing: Easing.out(Easing.quad),
      useNativeDriver: native,
    }).start();
  return {
    pressed,
    style: { transform: [{ scale }] },
    onPressIn: () => {
      setPressed(true);
      if (!reduceMotion) to(amount);
    },
    onPressOut: () => {
      setPressed(false);
      if (!reduceMotion) to(1);
    },
  };
}

/** Fades and slides its content in when it first appears; `index` staggers a list a little. */
export function Reveal({
  children,
  index = 0,
  style,
}: {
  children: ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { reduceMotion } = useTheme();
  const [progress] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      delay: Math.min(index, 8) * 45,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    }).start();
  }, [progress, index, reduceMotion]);
  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

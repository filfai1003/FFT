import { useEffect, useState } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import { useTheme } from '@/design/use-theme';
import { Icon } from './Icon';

const native = Platform.OS !== 'web';

/** How long the fill takes when a check is ticked (unticking is quicker). */
export const CHECK_FILL_MS = 240;

/**
 * The inside of a round tick button (a set, a fixed meal): when it is ticked the circle fills
 * with `fill` from the centre and the check pops a little. Instant with "reduce motion". Put it
 * in a round, transparent Pressable of the same `size`; the caller gives the haptic tick
 * (`confirm()` in lib/haptics, which respects the Haptics setting).
 */
export function CheckFill({
  done,
  size,
  fill,
  iconOn,
  iconOff,
  iconSize = 22,
}: {
  done: boolean;
  size: number;
  fill: string;
  /** Check colour on the fill, and when not ticked. */
  iconOn: string;
  iconOff: string;
  iconSize?: number;
}) {
  const { reduceMotion } = useTheme();
  const [progress] = useState(() => new Animated.Value(done ? 1 : 0));
  useEffect(() => {
    const to = done ? 1 : 0;
    if (reduceMotion) {
      progress.setValue(to);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: to,
      duration: done ? CHECK_FILL_MS : CHECK_FILL_MS / 2,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    });
    animation.start();
    return () => animation.stop();
  }, [done, reduceMotion, progress]);

  return (
    <>
      <Animated.View
        testID="check-fill"
        pointerEvents="none"
        aria-hidden
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: fill,
          opacity: progress,
          transform: [
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
          ],
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={{
          transform: [
            {
              scale: progress.interpolate({
                inputRange: [0, 0.6, 1],
                outputRange: [1, 1.25, 1],
              }),
            },
          ],
        }}
      >
        <Icon name="check" size={iconSize} color={done ? iconOn : iconOff} />
      </Animated.View>
    </>
  );
}

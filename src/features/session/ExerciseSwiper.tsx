import { useEffect, useRef, type ReactNode } from 'react';
import { Keyboard, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/design/use-theme';
import { swipeOffset, swipeStep } from '@/features/navigation/swipe';
import { useHorizontalPan } from '@/features/navigation/swipe-gesture';
import { tick } from '@/lib/haptics';

const OUT_MS = 170;
const IN_MS = 220;
/** A move made with the buttons slides in from this share of the width (with a fade). */
const SHIFT = 0.15;

// A plain function: a worklet cannot capture the Keyboard module itself (Worklets refuses to copy
// `KeyboardImpl`, and that error closed the app on opening a workout), only call this back on JS.
const dismissKeyboard = () => Keyboard.dismiss();

/**
 * Swipe left / right between the exercises of the workout (DECISIONS 71). The content follows
 * the finger, leaves on that side and the next one comes in from the other; moves made with the
 * buttons shift in a little. Every value typed is already in the session store (set rows save on
 * each keystroke), so moving never loses data; the keyboard is closed first. With reduce motion
 * it switches without movement. `page` identifies what is shown (the first exercise of the
 * group), `order` its place, so a change can come in from the right side.
 */
export function ExerciseSwiper({
  page,
  order,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  children,
}: {
  page: string;
  order: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  children: ReactNode;
}) {
  const { reduceMotion } = useTheme();
  // The screen width until the content is measured.
  const width = useSharedValue(useWindowDimensions().width);
  const offset = useSharedValue(0);
  const opacity = useSharedValue(1);
  // 1 / -1 while a swipe has sent the content off to that side (it comes back from the other).
  const swiped = useSharedValue(0);
  const last = useRef({ page, order });

  useEffect(() => {
    const before = last.current;
    last.current = { page, order };
    if (before.page === page) return;
    const dir = order >= before.order ? 1 : -1;
    const fromSwipe = swiped.get() !== 0;
    swiped.set(0);
    cancelAnimation(offset);
    cancelAnimation(opacity);
    if (reduceMotion) {
      offset.set(0);
      opacity.set(1);
      return;
    }
    const w = width.get();
    offset.set(dir * w * (fromSwipe ? 1 : SHIFT));
    opacity.set(fromSwipe ? 1 : 0);
    const timing = { duration: IN_MS, easing: Easing.out(Easing.cubic) };
    offset.set(withTiming(0, timing));
    opacity.set(withTiming(1, timing));
  }, [page, order, reduceMotion, offset, opacity, swiped, width]);

  const move = (step: number) => {
    Keyboard.dismiss();
    tick();
    if (step > 0) onNext();
    else onPrevious();
  };

  const pan = useHorizontalPan(canPrevious || canNext)
    .withTestId('exercise-swipe')
    .onStart(() => {
      'worklet';
      cancelAnimation(offset);
      scheduleOnRN(dismissKeyboard);
    })
    .onUpdate((e) => {
      'worklet';
      offset.set(swipeOffset(e.translationX, canPrevious, canNext));
    })
    .onEnd((e) => {
      'worklet';
      const w = width.get();
      const step = swipeStep(e.translationX, e.velocityX, w, canPrevious, canNext);
      if (step === 0) {
        offset.set(reduceMotion ? 0 : withTiming(0, { duration: IN_MS }));
        return;
      }
      swiped.set(step);
      if (reduceMotion) {
        offset.set(0);
        scheduleOnRN(move, step);
        return;
      }
      offset.set(
        withTiming(-step * w, { duration: OUT_MS, easing: Easing.in(Easing.quad) }, (done) => {
          if (done) scheduleOnRN(move, step);
        }),
      );
    });

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: offset.get() }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e) => width.set(e.nativeEvent.layout.width)}>
        <Animated.View style={[{ gap: 16 }, style]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

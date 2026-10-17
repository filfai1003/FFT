import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { swipeIntent } from './swipe';

/**
 * A pan gesture that becomes active only for a page swipe (see `swipeIntent`): clearly
 * horizontal, not from a screen edge. Until then the touch belongs to whatever is under the
 * finger (scroll views, buttons, fields). Add onStart / onUpdate / onEnd to the result.
 */
export function useHorizontalPan(enabled: boolean) {
  const { width: screenWidth } = useWindowDimensions();
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const decided = useSharedValue(false);
  return Gesture.Pan()
    .enabled(enabled)
    .manualActivation(true)
    .onTouchesDown((e) => {
      'worklet';
      const touch = e.allTouches[0];
      if (!touch) return;
      startX.set(touch.absoluteX);
      startY.set(touch.absoluteY);
      decided.set(false);
    })
    .onTouchesMove((e, manager) => {
      'worklet';
      if (decided.get()) return;
      const touch = e.allTouches[0];
      if (!touch || e.numberOfTouches > 1) {
        decided.set(true);
        manager.fail();
        return;
      }
      const intent = swipeIntent(
        touch.absoluteX - startX.get(),
        touch.absoluteY - startY.get(),
        startX.get(),
        screenWidth,
      );
      if (intent === 'activate') {
        decided.set(true);
        manager.activate();
      } else if (intent === 'fail') {
        decided.set(true);
        manager.fail();
      }
    });
}

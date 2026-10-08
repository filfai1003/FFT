import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bars, space, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';

/** Total height including the bottom safe area; pass it to <Screen bottomBarHeight>. */
export function useActionBarHeight() {
  const { bottom } = useSafeAreaInsets();
  return bars.bottomActionBarPaddingY * 2 + touch.primaryButtonHeight + bottom;
}

/** Height of the on-screen keyboard (0 when hidden), so a fixed bar can sit above it. */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * Fixed bar at the bottom for the main action of a form/editor ("Save day"…), in thumb reach.
 * Render it as a sibling after <Screen>; content scrolls underneath. It rides above the keyboard.
 */
export function BottomActionBar({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: keyboard,
        paddingTop: bars.bottomActionBarPaddingY,
        paddingHorizontal: space.screenX,
        paddingBottom: bars.bottomActionBarPaddingY + (keyboard > 0 ? 0 : bottom),
        gap: space.gapM,
        borderTopWidth: 1,
        borderTopColor: colors.borderDecorative,
        backgroundColor: colors.bg,
      }}
    >
      {children}
    </View>
  );
}

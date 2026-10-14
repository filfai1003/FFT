import type { ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardStickyView } from './keyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bars, space, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';

/** Total height including the bottom safe area; pass it to <Screen bottomBarHeight>. */
export function useActionBarHeight() {
  const { bottom } = useSafeAreaInsets();
  return bars.bottomActionBarPaddingY * 2 + touch.primaryButtonHeight + bottom;
}

/**
 * Fixed bar at the bottom for the main action of a form/editor ("Save day"…), in thumb reach.
 * Render it as a sibling after <Screen>; content scrolls underneath. It rides above the keyboard.
 */
export function BottomActionBar({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  return (
    // Follows the keyboard frame by frame; when it is open the safe-area padding goes under it.
    <KeyboardStickyView
      offset={{ closed: 0, opened: bottom }}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
    >
      <View
        style={{
          paddingTop: bars.bottomActionBarPaddingY,
          paddingHorizontal: space.screenX,
          paddingBottom: bars.bottomActionBarPaddingY + bottom,
          gap: space.gapM,
          borderTopWidth: 1,
          borderTopColor: colors.borderDecorative,
          backgroundColor: colors.bg,
        }}
      >
        {children}
      </View>
    </KeyboardStickyView>
  );
}

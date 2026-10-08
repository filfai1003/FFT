import type { ReactNode } from 'react';
import { View } from 'react-native';
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
 * Render it as a sibling after <Screen>; content scrolls underneath.
 */
export function BottomActionBar({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
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
  );
}

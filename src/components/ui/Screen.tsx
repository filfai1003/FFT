import type { ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { KeyboardAwareScrollView } from './keyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { FieldChain } from './field-chain';

export type ScreenProps = {
  children: ReactNode;
  /** Scrolls the content. Fixed bars rendered by the layout sit above it, content scrolls under. */
  scroll?: boolean;
  /** Space reserved at the bottom for a fixed bar (tab bar, action bar), on top of the safe area. */
  bottomBarHeight?: number;
  /**
   * Scroll the focused field above the keyboard (default). Off for pages whose only field lives
   * outside the scroll (Home: the coach bar follows the keyboard by itself), so no empty space
   * the size of the keyboard is added under the content.
   */
  keyboardAware?: boolean;
  /** Set when a native header already covers the top safe area. */
  noTopInset?: boolean;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  /** Scroll events of a scrolling page (Home hides its coach bar while scrolling down). */
  onScroll?: ScrollViewProps['onScroll'];
};

/** A page: theme background, safe areas and the side padding of the design. */
export function Screen({
  children,
  scroll = false,
  bottomBarHeight = 0,
  noTopInset = false,
  keyboardAware = true,
  gap = 16,
  style,
  onScroll,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const padding = {
    // Never flush with the edge: a little air above the first element, on top of the safe area.
    paddingTop: (noTopInset ? 0 : insets.top) + space.gapXL,
    paddingBottom: bottomBarHeight > 0 ? bottomBarHeight : insets.bottom,
    paddingHorizontal: space.screenX,
    gap,
  };

  return (
    <FieldChain>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        {scroll ? (
          // Scrolls the focused field above the keyboard (and above a fixed action bar).
          <KeyboardAwareScrollView
            enabled={keyboardAware}
            style={styles.fill}
            bottomOffset={bottomBarHeight > 0 ? bottomBarHeight + space.gapM : space.gapXL}
            contentContainerStyle={[padding, style]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={onScroll ? 16 : undefined}
          >
            {children}
          </KeyboardAwareScrollView>
        ) : (
          <View style={[styles.fill, padding, style]}>{children}</View>
        )}
        {/* The status bar area stays solid: scrolled content never shows under the clock. */}
        {scroll && !noTopInset && insets.top > 0 ? (
          <View
            testID="screen-status-bar"
            pointerEvents="none"
            aria-hidden
            style={[styles.statusBar, { height: insets.top, backgroundColor: colors.bg }]}
          />
        ) : null}
      </View>
    </FieldChain>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  statusBar: { position: 'absolute', top: 0, left: 0, right: 0 },
});

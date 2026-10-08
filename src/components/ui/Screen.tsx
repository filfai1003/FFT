import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, space } from '@/design/tokens';
import { DotGrid } from './DotGrid';

export type ScreenProps = {
  children: ReactNode;
  /** Scrolls the content. Fixed bars rendered by the layout sit above it, content scrolls under. */
  scroll?: boolean;
  /** Space reserved at the bottom for a fixed bar (tab bar, action bar), on top of the safe area. */
  bottomBarHeight?: number;
  /** Set when a native header already covers the top safe area. */
  noTopInset?: boolean;
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

/** Black screen with the dot grid, safe areas and the 20px side padding of the design. */
export function Screen({
  children,
  scroll = false,
  bottomBarHeight = 0,
  noTopInset = false,
  gap = 16,
  style,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: noTopInset ? 0 : insets.top,
    paddingBottom: bottomBarHeight > 0 ? bottomBarHeight : insets.bottom,
    paddingHorizontal: space.screenX,
    gap,
  };

  return (
    <View style={styles.root}>
      <DotGrid />
      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[padding, style]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, padding, style]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
});

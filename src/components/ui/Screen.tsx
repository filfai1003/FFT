import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
  /** Set when a native header already covers the top safe area. */
  noTopInset?: boolean;
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

/** A page: theme background, safe areas and the side padding of the design. */
export function Screen({
  children,
  scroll = false,
  bottomBarHeight = 0,
  noTopInset = false,
  gap = 16,
  style,
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
    </FieldChain>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
});

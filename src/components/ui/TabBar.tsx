import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bars, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type TabBarItem = {
  key: string;
  label: string;
  icon: IconName;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
};

/** Total height of the bar including the bottom safe area; use it as content bottom padding. */
export function useTabBarHeight() {
  const { bottom } = useSafeAreaInsets();
  return bars.tabBarPaddingTop + touch.listRowMin + bottom;
}

/**
 * Bottom navigation: icon + mono label, white when active with a 4px accent dot below.
 * Presentational: the Expo Router adapter lives in app/(tabs)/_layout.tsx.
 */
export function TabBar({ items }: { items: readonly TabBarItem[] }) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        paddingTop: bars.tabBarPaddingTop,
        paddingBottom: bottom,
        paddingHorizontal: 4,
        borderTopWidth: 1,
        borderTopColor: colors.borderDecorative,
        backgroundColor: colors.bg,
      }}
    >
      {items.map((item) => {
        const color = item.active ? colors.text : colors.textMuted;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: item.active }}
            aria-selected={item.active}
            onPress={() => {
              if (!item.active) tick();
              item.onPress();
            }}
            onLongPress={item.onLongPress}
            style={{
              flex: 1,
              minHeight: touch.listRowMin,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <Icon name={item.icon} size={22} color={color} />
            <Text variant="label" style={{ color, letterSpacing: 0.9 }}>
              {item.label}
            </Text>
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: item.active ? colors.accent : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

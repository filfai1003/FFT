import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bars } from '@/design/tokens';
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

/** The round button in the middle of the bar (the "+" that opens Add). */
export type TabBarAction = { label: string; icon: IconName; onPress: () => void };

/** Total height of the bar including the bottom safe area; use it as content bottom padding. */
export function useTabBarHeight() {
  const { bottom } = useSafeAreaInsets();
  return bars.tabBarPaddingTop + bars.tabBarHeight + bottom;
}

/**
 * Bottom navigation: icon + label (dark when active), with an optional round action in the
 * middle. Presentational: the Expo Router adapter lives in app/(tabs)/_layout.tsx.
 */
export function TabBar({ items, action }: { items: readonly TabBarItem[]; action?: TabBarAction }) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const half = Math.ceil(items.length / 2);

  const tab = (item: TabBarItem) => {
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
          height: bars.tabBarHeight - 6,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
        }}
      >
        <Icon name={item.icon} size={24} color={color} />
        <Text variant="label" style={{ color, fontWeight: item.active ? '600' : '500' }}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: bars.tabBarPaddingTop,
        paddingBottom: bottom,
        paddingHorizontal: 6,
        minHeight: bars.tabBarHeight,
        borderTopWidth: 1,
        borderTopColor: colors.borderDecorative,
        backgroundColor: colors.surface,
      }}
    >
      {items.slice(0, action ? half : items.length).map(tab)}
      {action ? (
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={() => {
              tick();
              action.onPress();
            }}
            style={({ pressed }) => ({
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.text,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Icon name={action.icon} size={26} color={colors.bg} />
          </Pressable>
        </View>
      ) : null}
      {action ? items.slice(half).map(tab) : null}
    </View>
  );
}

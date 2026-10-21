import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bars } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { indicatorSlot, tabFocus } from '@/features/navigation/swipe';
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

const SIDE_PADDING = 6;
const PILL_INSET = 6;
const ACTIVE_SCALE = 1.12;

/**
 * Bottom navigation: icon + label, with an optional round action in the middle. A soft pill sits
 * under the current tab and slides with `position` (the tab pager's page, a float while a swipe
 * is under way); the current icon grows a little and darkens, its label turns semibold, so the
 * current page never depends on colour alone. Presentational: the Expo Router adapter lives in
 * app/(tabs)/_layout.tsx.
 */
export function TabBar({
  items,
  action,
  position,
}: {
  items: readonly TabBarItem[];
  action?: TabBarAction;
  position?: SharedValue<number>;
}) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const half = Math.ceil(items.length / 2);
  const activeIndex = Math.max(
    0,
    items.findIndex((x) => x.active),
  );
  // Without a pager (catalogue, tests) the pill follows the active tab.
  const own = useSharedValue(activeIndex);
  useEffect(() => {
    own.value = activeIndex;
  }, [own, activeIndex]);
  const pos = position ?? own;
  const [rowWidth, setRowWidth] = useState(0);
  const slots = items.length + (action ? 1 : 0);
  const slotWidth = slots > 0 ? (rowWidth - SIDE_PADDING * 2) / slots : 0;
  const count = items.length;
  const hasAction = action != null;

  const pill = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          SIDE_PADDING + indicatorSlot(pos.value, count, hasAction) * slotWidth + PILL_INSET,
      },
    ],
  }));

  const tab = (item: TabBarItem, index: number) => (
    <Tab key={item.key} item={item} index={index} position={pos} />
  );

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: bars.tabBarPaddingTop,
        paddingBottom: bottom,
        paddingHorizontal: SIDE_PADDING,
        minHeight: bars.tabBarHeight,
        borderTopWidth: 1,
        borderTopColor: colors.borderDecorative,
        backgroundColor: colors.surface,
      }}
    >
      {slotWidth > 0 ? (
        <Animated.View
          aria-hidden
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              top: bars.tabBarPaddingTop + 3,
              width: slotWidth - PILL_INSET * 2,
              height: bars.tabBarHeight - 12,
              borderRadius: 16,
              backgroundColor: colors.surfaceAlt,
            },
            pill,
          ]}
        />
      ) : null}
      {items.slice(0, action ? half : items.length).map((item, i) => tab(item, i))}
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
      {action ? items.slice(half).map((item, i) => tab(item, half + i)) : null}
    </View>
  );
}

function Tab({
  item,
  index,
  position,
}: {
  item: TabBarItem;
  index: number;
  position: SharedValue<number>;
}) {
  const { colors } = useTheme();
  // The icon grows towards the current page and its dark copy fades in over the muted one.
  const scale = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(tabFocus(position.value, index), [0, 1], [1, ACTIVE_SCALE]) }],
  }));
  const dark = useAnimatedStyle(() => ({ opacity: tabFocus(position.value, index) }));
  const color = item.active ? colors.text : colors.textMuted;
  return (
    <Pressable
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
      <Animated.View style={[{ width: 24, height: 24 }, scale]}>
        <Icon name={item.icon} size={24} color={colors.textMuted} />
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, dark]}>
          <Icon name={item.icon} size={24} color={colors.text} />
        </Animated.View>
      </Animated.View>
      <Text variant="label" semibold={item.active} medium={!item.active} style={{ color }}>
        {item.label}
      </Text>
    </Pressable>
  );
}

import { useTranslation } from 'react-i18next';
import { TabBar, type TabBarItem } from '@/components/ui/TabBar';
import { useTheme } from '@/design/use-theme';
import { SwipeTabs, type SwipeTabBarProps } from '@/features/navigation/SwipeTabs';
import { AddSheet, useAddSheet } from '@/features/today/AddSheet';
import type { IconName } from '@/components/ui/Icon';

const tabs = [
  { name: 'index', icon: 'home', label: 'nav.today' },
  { name: 'diet', icon: 'bowl', label: 'nav.diet' },
  { name: 'train', icon: 'dumbbell', label: 'nav.train' },
  { name: 'progress', icon: 'chart', label: 'nav.progress' },
] as const satisfies readonly { name: string; icon: IconName; label: string }[];

/** The swipeable pages, in order (the "+" in the middle of the bar is not a page). */
const pages = tabs.map((tab) => tab.name);

function AppTabBar({ state, navigation, position }: SwipeTabBarProps) {
  const { t } = useTranslation();
  const openAdd = useAddSheet((st) => st.set);
  const items: TabBarItem[] = state.routes.flatMap((route, index) => {
    const tab = tabs.find((x) => x.name === route.name);
    if (!tab) return [];
    return [
      {
        key: route.key,
        label: t(tab.label),
        icon: tab.icon,
        // The calendar is a page of Today, so Today stays lit while it is open.
        active:
          state.index === index ||
          (route.name === 'index' && state.routes[state.index]?.name === 'calendar'),
        onPress: () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          // Always the tab's first page, even if a detail page of it was left open earlier.
          if (state.index !== index && !event.defaultPrevented)
            navigation.navigate(route.name, { screen: 'index' });
        },
        onLongPress: () => navigation.emit({ type: 'tabLongPress', target: route.key }),
      },
    ];
  });
  return (
    <TabBar
      items={items}
      position={position}
      action={{ label: t('add.title'), icon: 'plus', onPress: () => openAdd(true) }}
    />
  );
}

/** Today, Diet, Train and Progress side by side: tap a tab or swipe between them (DECISIONS 70). */
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <>
      <SwipeTabs
        pages={pages}
        tabBar={(props) => <AppTabBar {...props} />}
        screenOptions={{ sceneStyle: { backgroundColor: colors.bg } }}
      >
        {tabs.map((tab) => (
          // Leaving a tab resets its stack: coming back shows the tab's first page, never a detail page
          // that was opened from elsewhere (e.g. the calendar opened from Today).
          <SwipeTabs.Screen key={tab.name} name={tab.name} options={{ popToTopOnBlur: true }} />
        ))}
      </SwipeTabs>
      <AddSheet />
    </>
  );
}

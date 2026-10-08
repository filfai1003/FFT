import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { TabBar, type TabBarItem } from '@/components/ui/TabBar';
import type { IconName } from '@/components/ui/Icon';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const tabs = [
  { name: 'index', icon: 'today', label: 'nav.today' },
  { name: 'train', icon: 'train', label: 'nav.train' },
  { name: 'diet', icon: 'diet', label: 'nav.diet' },
  { name: 'progress', icon: 'progress', label: 'nav.progress' },
  { name: 'profile', icon: 'profile', label: 'nav.profile' },
] as const satisfies readonly { name: string; icon: IconName; label: string }[];

function AppTabBar({ state, navigation }: TabBarProps) {
  const { t } = useTranslation();
  const items: TabBarItem[] = state.routes.flatMap((route, index) => {
    const tab = tabs.find((x) => x.name === route.name);
    if (!tab) return [];
    return [
      {
        key: route.key,
        label: t(tab.label),
        icon: tab.icon,
        active: state.index === index,
        onPress: () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (state.index !== index && !event.defaultPrevented) navigation.navigate(route.name);
        },
        onLongPress: () => navigation.emit({ type: 'tabLongPress', target: route.key }),
      },
    ];
  });
  return <TabBar items={items} />;
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
      {tabs.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} />
      ))}
    </Tabs>
  );
}

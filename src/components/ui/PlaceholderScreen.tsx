import { Screen } from './Screen';
import { Text } from './Text';
import { useTabBarHeight } from './TabBar';

/** Temporary body of tab roots until their phase. Remove screen by screen. */
export function PlaceholderScreen({ title }: { title: string }) {
  const tabBarHeight = useTabBarHeight();
  return (
    <Screen scroll bottomBarHeight={tabBarHeight}>
      <Text variant="displayL">{title}</Text>
    </Screen>
  );
}

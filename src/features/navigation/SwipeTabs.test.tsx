import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Pressable, Text } from 'react-native';
import { useAppearanceStore } from '@/design/appearance-store';
import { SwipeTabs, type SwipeTabBarProps } from './SwipeTabs';

const pages = ['index', 'diet', 'train'];

function Bar({ state, navigation }: SwipeTabBarProps) {
  return (
    <>
      {state.routes
        .filter((r) => pages.includes(r.name))
        .map((r) => (
          <Pressable
            key={r.key}
            accessibilityRole="tab"
            accessibilityLabel={`tab-${r.name}`}
            accessibilityState={{ selected: state.routes[state.index]?.key === r.key }}
            onPress={() => navigation.navigate(r.name, { screen: 'index' })}
          />
        ))}
    </>
  );
}

const page = (name: string) =>
  function Page() {
    return <Text>{`page-${name}`}</Text>;
  };

const routes = {
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/_layout': () => (
    <SwipeTabs pages={pages} tabBar={(p) => <Bar {...p} />}>
      {pages.map((name) => (
        <SwipeTabs.Screen key={name} name={name} options={{ popToTopOnBlur: true }} />
      ))}
    </SwipeTabs>
  ),
  '(tabs)/index': page('today'),
  '(tabs)/calendar': page('calendar'),
  '(tabs)/diet/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/diet/index': page('diet'),
  '(tabs)/train/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/train/index': page('train'),
  '(tabs)/train/history': page('history'),
};

describe('SwipeTabs', () => {
  afterEach(async () => {
    await act(() => useAppearanceStore.getState().reset());
  });

  it('opens the tab of a deep link and keeps its stack', async () => {
    await renderRouter(routes, { initialUrl: '/train/history' });
    expect(screen.getByText('page-history')).toBeTruthy();
  });

  it('a tab press moves to that page; other pages are hidden from screen readers', async () => {
    useAppearanceStore.getState().set('reduceMotion', true);
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen.getByText('page-today')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('tab-diet'));
    expect(screen.getByText('page-diet')).toBeTruthy();
    // Today stays mounted (its state is kept) but is out of reach.
    expect(screen.queryByText('page-today')).toBeNull();
    expect(screen.getByText('page-today', { includeHiddenElements: true })).toBeTruthy();
  });

  it('a route that is not a page opens on top of the pages', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });
    expect(screen.getByText('page-calendar')).toBeTruthy();
    // The page under it (Today) is there but out of reach.
    expect(screen.queryByText('page-today')).toBeNull();
    expect(screen.getByText('page-today', { includeHiddenElements: true })).toBeTruthy();
  });
});

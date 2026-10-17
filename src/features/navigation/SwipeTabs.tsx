import { withLayoutContext } from 'expo-router';
import {
  StackActions,
  TabRouter,
  useNavigationBuilder,
  type DefaultNavigatorOptions,
  type Descriptor,
  type NavigationHelpers,
  type NavigationProp,
  type ParamListBase,
  type RouteProp,
  type TabActionHelpers,
  type TabNavigationState,
  type TabRouterOptions,
} from 'expo-router/react-navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { motion, tabDuration } from '@/design/transitions';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { useTabSwipeLock } from './swipe-lock';
import { dragPosition, settlePage, swipeIntent } from './swipe';

/**
 * The app's tab navigator (DECISIONS 70): the same router as Expo Router's Tabs (so routes, deep
 * links like /train and each tab's own Stack work unchanged), but the main pages sit side by
 * side: a horizontal swipe on a tab's first page drags the neighbouring tab in under the finger,
 * and the tab bar's pill follows the same position. A tap on a tab shifts the page in instead.
 * Routes that are not pages (the calendar) open on top of the pages.
 */

export type SwipeTabOptions = {
  /** Leaving the tab resets its stack to its first page. */
  popToTopOnBlur?: boolean;
  sceneStyle?: ViewStyle;
};

type EventMap = {
  tabPress: { data: undefined; canPreventDefault: true };
  tabLongPress: { data: undefined };
};
type State = TabNavigationState<ParamListBase>;
type Navigation = NavigationHelpers<ParamListBase, EventMap> & TabActionHelpers<ParamListBase>;
type Descriptors = Record<
  string,
  Descriptor<
    SwipeTabOptions,
    NavigationProp<ParamListBase, string, undefined, State, SwipeTabOptions, EventMap>,
    RouteProp<ParamListBase>
  >
>;

export type SwipeTabBarProps = {
  state: State;
  navigation: Navigation;
  descriptors: Descriptors;
  /** The page under the finger, as a float (1.5 = half way between the 2nd and 3rd page). */
  position: SharedValue<number>;
};

type Props = DefaultNavigatorOptions<
  ParamListBase,
  string | undefined,
  State,
  SwipeTabOptions,
  EventMap,
  NavigationProp<ParamListBase>
> &
  TabRouterOptions & {
    /** Route names of the swipeable pages, in order. */
    pages: readonly string[];
    tabBar: (props: SwipeTabBarProps) => ReactNode;
  };

const PositionContext = createContext<SharedValue<number> | null>(null);

/** The tab pager's position (null outside the tabs). */
export function useTabPosition() {
  return useContext(PositionContext);
}

/** 0 = pages side by side (swipe); 1 = a tapped tab shifts in over a short distance. */
const PAGER = 0;
const SHIFT = 1;
const SHIFT_DISTANCE = 0.12;
/** Neighbouring pages mount this long after a page settles, so a swipe finds them ready. */
const PRELOAD_DELAY = 500;

function SwipeTabNavigator({
  id,
  initialRouteName,
  backBehavior,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  UNSTABLE_router,
  UNSTABLE_routeNamesChangeBehavior,
  pages,
  tabBar,
}: Props) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder<
    State,
    TabRouterOptions,
    TabActionHelpers<ParamListBase>,
    SwipeTabOptions,
    EventMap
  >(TabRouter, {
    id,
    initialRouteName,
    backBehavior,
    children,
    layout,
    screenListeners,
    screenOptions,
    screenLayout,
    UNSTABLE_router,
    UNSTABLE_routeNamesChangeBehavior,
  });
  return (
    <NavigationContent>
      <SwipeTabView
        state={state}
        navigation={navigation as Navigation}
        descriptors={descriptors as unknown as Descriptors}
        pages={pages}
        tabBar={tabBar}
      />
    </NavigationContent>
  );
}

function SwipeTabView({
  state,
  navigation,
  descriptors,
  pages,
  tabBar,
}: {
  state: State;
  navigation: Navigation;
  descriptors: Descriptors;
  pages: readonly string[];
  tabBar: Props['tabBar'];
}) {
  const { colors, reduceMotion } = useTheme();
  const focused = state.routes[state.index]!;
  const focusedPage = pages.indexOf(focused.name);
  const pageRoutes = pages.flatMap((name) => state.routes.filter((r) => r.name === name));
  const count = pageRoutes.length;

  // The page behind whatever is on top: the focused page, else the last one (the calendar opens
  // over Today, so Today stays the current page).
  const [basePage, setBasePage] = useState(Math.max(0, focusedPage));
  if (focusedPage >= 0 && focusedPage !== basePage) setBasePage(focusedPage);

  // Pages are mounted when first shown, and their neighbours a moment later so a swipe finds
  // them ready.
  const baseKey = pageRoutes[basePage]?.key;
  const [loaded, setLoaded] = useState<readonly string[]>(() => [focused.key]);
  if (!loaded.includes(focused.key)) setLoaded([...loaded, focused.key]);
  else if (baseKey && !loaded.includes(baseKey)) setLoaded([...loaded, baseKey]);
  useEffect(() => {
    const neighbours = [pageRoutes[basePage - 1], pageRoutes[basePage + 1]]
      .filter((r) => r != null)
      .map((r) => r.key);
    const timer = setTimeout(
      () =>
        setLoaded((prev) =>
          neighbours.every((k) => prev.includes(k))
            ? prev
            : [...prev, ...neighbours.filter((k) => !prev.includes(k))],
        ),
      PRELOAD_DELAY,
    );
    return () => clearTimeout(timer);
    // pageRoutes is rebuilt each render; the keys only change with the routes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePage, state.routes]);

  const width = useSharedValue(0);
  const position = useSharedValue(basePage);
  const mode = useSharedValue(PAGER);
  const fromPage = useSharedValue(basePage);
  const toPage = useSharedValue(basePage);
  const startPage = useSharedValue(basePage);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const decided = useSharedValue(false);
  // A page change that a swipe already animated (-1 = none): the effect below must not animate
  // it again.
  const settling = useSharedValue(-1);
  const previous = useRef({ page: basePage, key: focused.key });

  useEffect(() => {
    const from = previous.current.page;
    previous.current.page = basePage;
    const swiped = settling.get() === basePage;
    settling.set(-1);
    if (swiped || from === basePage) return;
    cancelAnimation(position);
    const duration = tabDuration(reduceMotion);
    if (duration === 0) {
      position.set(basePage);
      return;
    }
    mode.set(SHIFT);
    fromPage.set(from);
    toPage.set(basePage);
    position.set(from);
    position.set(withTiming(basePage, { duration, easing: Easing.out(Easing.cubic) }));
  }, [basePage, reduceMotion, position, mode, fromPage, toPage, settling]);

  // Leaving a tab resets its stack (popToTopOnBlur), once the page is out of sight.
  useEffect(() => {
    const prevKey = previous.current.key;
    previous.current.key = focused.key;
    if (prevKey === focused.key || !descriptors[prevKey]?.options.popToTopOnBlur) return;
    const prevRoute = state.routes.find((r) => r.key === prevKey);
    const nested = prevRoute?.state;
    if (nested?.type !== 'stack' || !nested.key || (nested.index ?? 0) === 0) return;
    const target = nested.key;
    const timer = setTimeout(
      () => navigation.dispatch({ ...StackActions.popToTop(), target }),
      motion.tab + 40,
    );
    return () => clearTimeout(timer);
  }, [focused.key, descriptors, navigation, state.routes]);

  // Swiping works on a tab's first page only, when nothing on the page holds it (edit mode).
  const locked = useTabSwipeLock((s) => s.reasons.length > 0);
  const nestedIndex = focused.state?.index ?? 0;
  const swipeEnabled = focusedPage >= 0 && nestedIndex === 0 && !locked && count > 1;

  const goTo = (page: number) => {
    const route = pageRoutes[page];
    if (!route) return;
    tick();
    navigation.navigate(route.name);
  };

  const pan = Gesture.Pan()
    .enabled(swipeEnabled)
    .manualActivation(true)
    .onTouchesDown((e) => {
      const touch = e.allTouches[0];
      if (!touch) return;
      startX.set(touch.absoluteX);
      startY.set(touch.absoluteY);
      decided.set(false);
    })
    .onTouchesMove((e, manager) => {
      if (decided.get()) return;
      const touch = e.allTouches[0];
      if (!touch || e.numberOfTouches > 1) {
        decided.set(true);
        manager.fail();
        return;
      }
      const intent = swipeIntent(
        touch.absoluteX - startX.get(),
        touch.absoluteY - startY.get(),
        startX.get(),
        width.get(),
      );
      if (intent === 'activate') {
        decided.set(true);
        manager.activate();
      } else if (intent === 'fail') {
        decided.set(true);
        manager.fail();
      }
    })
    .onStart(() => {
      cancelAnimation(position);
      mode.set(PAGER);
      startPage.set(Math.round(position.get()));
    })
    .onUpdate((e) => {
      position.set(dragPosition(startPage.get(), e.translationX, width.get(), count));
    })
    .onEnd((e) => {
      const from = startPage.get();
      const target = settlePage(from, e.translationX, e.velocityX, width.get(), count);
      const distance = Math.abs(position.get() - target);
      position.set(
        withTiming(target, {
          duration: reduceMotion ? 0 : Math.max(120, Math.min(300, distance * 320)),
          easing: Easing.out(Easing.cubic),
        }),
      );
      if (target !== from) {
        settling.set(target);
        scheduleOnRN(goTo, target);
      }
    });

  const overlay = focusedPage < 0 ? focused : null;

  return (
    <PositionContext.Provider value={position}>
      <View style={styles.root}>
        <GestureDetector gesture={pan}>
          <View
            style={styles.pages}
            onLayout={(e) => {
              width.set(e.nativeEvent.layout.width);
            }}
          >
            {pageRoutes.map((route, page) =>
              loaded.includes(route.key) ? (
                <Page
                  key={route.key}
                  page={page}
                  position={position}
                  width={width}
                  mode={mode}
                  fromPage={fromPage}
                  toPage={toPage}
                  current={page === basePage && !overlay}
                  style={[
                    { backgroundColor: colors.bg },
                    descriptors[route.key]?.options.sceneStyle,
                  ]}
                >
                  {descriptors[route.key]!.render()}
                </Page>
              ) : null,
            )}
            {overlay ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: colors.bg },
                  descriptors[overlay.key]?.options.sceneStyle,
                ]}
              >
                {descriptors[overlay.key]!.render()}
              </View>
            ) : null}
          </View>
        </GestureDetector>
        {tabBar({ state, navigation, descriptors, position })}
      </View>
    </PositionContext.Provider>
  );
}

/** One page: placed by the shared position, hidden from touch and screen readers when not current. */
function Page({
  page,
  position,
  width,
  mode,
  fromPage,
  toPage,
  current,
  style,
  children,
}: {
  page: number;
  position: SharedValue<number>;
  width: SharedValue<number>;
  mode: SharedValue<number>;
  fromPage: SharedValue<number>;
  toPage: SharedValue<number>;
  current: boolean;
  style: (ViewStyle | undefined)[];
  children: ReactNode;
}) {
  const animated = useAnimatedStyle(() => {
    const w = width.value;
    if (mode.value === SHIFT && fromPage.value !== toPage.value) {
      const span = toPage.value - fromPage.value;
      const t = Math.min(1, Math.max(0, (position.value - fromPage.value) / span));
      const dir = Math.sign(span);
      if (page === toPage.value)
        return { opacity: t, transform: [{ translateX: dir * w * SHIFT_DISTANCE * (1 - t) }] };
      if (page === fromPage.value)
        return { opacity: 1 - t, transform: [{ translateX: -dir * w * SHIFT_DISTANCE * t }] };
      return { opacity: 0, transform: [{ translateX: w * 2 }] };
    }
    const d = page - position.value;
    // Pages a whole page away or more stay out of sight (also before the width is known).
    if (Math.abs(d) >= 1)
      return { opacity: 0, transform: [{ translateX: Math.sign(d) * (w || 10000) }] };
    return { opacity: 1, transform: [{ translateX: d * w }] };
  });
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, ...style, animated]}
      pointerEvents={current ? 'auto' : 'none'}
      aria-hidden={!current}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pages: { flex: 1, overflow: 'hidden' },
});

/** Expo Router layout component: `<SwipeTabs pages={…} tabBar={…}>` with `SwipeTabs.Screen`. */
export const SwipeTabs = withLayoutContext<
  SwipeTabOptions,
  typeof SwipeTabNavigator,
  State,
  EventMap
>(SwipeTabNavigator);

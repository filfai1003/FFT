import { useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import { Platform } from 'react-native';

type Router = ReturnType<typeof useRouter>;

/** Pages you can land on when going "up" (the others, like /train/plan/<id>, have no page of their own). */
const PAGES = new Set([
  '/train',
  '/train/library',
  '/train/history',
  '/diet',
  '/progress',
  '/progress/strength',
  '/progress/body',
  '/progress/photos',
  '/profile',
  '/profile/settings',
  '/profile/accessibility',
  '/profile/privacy',
]);

/** One level up: "/progress/calendar" -> "/progress"; the nearest page when a level has none. */
export function parentPath(pathname: string): Href {
  const parts = pathname.split('/').filter(Boolean);
  while (parts.length > 1) {
    parts.pop();
    const path = `/${parts.join('/')}`;
    if (PAGES.has(path)) return path as Href;
  }
  return '/(tabs)';
}

/**
 * Back. With no history to go back to (a reloaded page, a deep link) it goes up one level of the
 * address instead (`fallback` overrides that where "up" is not the right place, e.g. an exercise
 * goes back to the library). The address is only known on the web; devices land on Today.
 */
export function goBack(router: Router, fallback?: Href) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  const up =
    fallback ??
    (Platform.OS === 'web' && typeof window !== 'undefined'
      ? parentPath(window.location.pathname)
      : '/(tabs)');
  router.replace(up);
}

/**
 * "Up" for a page that can be opened from another tab (the calendar from Today): back when the
 * page under this one is the parent, otherwise straight to the parent. So it never lands on an
 * unrelated tab, whatever way the page was opened.
 */
export function useGoUp(parent: Href, parentRoute = 'index') {
  const router = useRouter();
  const navigation = useNavigation();
  return () => {
    const routes = navigation.getState()?.routes ?? [];
    if (routes.length > 1 && routes[routes.length - 2].name === parentRoute) router.back();
    else router.replace(parent);
  };
}

/**
 * Back for a page that can be opened from anywhere (even from another navigator, like the AI chat
 * or a workout in progress): the opener passes `from` (its own address) and back returns to it.
 * Without `from` it is the normal back.
 */
export function useBack(fallback?: Href) {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  return () => {
    if (!from) return goBack(router, fallback);
    // The tab bar is the root of everything: replacing the page with it works even when the page was
    // opened directly (reload, link) and there is nothing to dismiss to.
    if (from === '/(tabs)') router.replace('/(tabs)');
    else router.navigate(from as Href);
  };
}

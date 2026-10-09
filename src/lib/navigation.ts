import type { Href, useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * Back with a fallback: after a page reload (web) or a deep link there is no history to go back
 * to, so we land on a sensible screen instead of doing nothing.
 */
export function goBack(router: Router, fallback: Href = '/(tabs)') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

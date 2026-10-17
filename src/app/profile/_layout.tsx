import { Stack } from 'expo-router';
import { useStackOptions } from '@/design/transitions';

// A page opened straight from another tab or a link still has the tab's first page under it.
export const unstable_settings = { initialRouteName: 'index' };

/** Detail pages slide in from the right (a fade with "reduce motion"): DECISIONS 69. */
export default function Layout() {
  return <Stack screenOptions={useStackOptions('push')} />;
}

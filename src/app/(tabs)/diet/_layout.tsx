import { Stack } from 'expo-router';
import { color } from '@/design/tokens';

// A page opened straight from another tab or a link still has the tab's first page under it.
export const unstable_settings = { initialRouteName: 'index' };

export default function Layout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />
  );
}

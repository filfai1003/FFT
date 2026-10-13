import { Stack } from 'expo-router';
import { useTheme } from '@/design/use-theme';

// A page opened straight from another tab or a link still has the tab's first page under it.
export const unstable_settings = { initialRouteName: 'index' };

export default function Layout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        // A short fade on the app's black: no sliding white-ish panels between pages.
        animation: 'fade',
        animationDuration: 160,
      }}
    />
  );
}

import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/design/use-theme';

/**
 * The status bar icons in the theme of the page on screen (DECISIONS 123): a page in another
 * theme scope than the app (the workout's, the dark scanner) mounts one, so its icons stay
 * readable; the newest one mounted wins and the previous comes back when it closes.
 */
export function ThemedStatusBar() {
  const { mode } = useTheme();
  return <StatusBar style={mode === 'light' ? 'dark' : 'light'} />;
}

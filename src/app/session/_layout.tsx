import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme, WorkoutThemeScope } from '@/design/use-theme';

/** The workout in progress follows its own theme setting (Settings → Workout theme). */
export default function SessionLayout() {
  return (
    <WorkoutThemeScope>
      <SessionStack />
    </WorkoutThemeScope>
  );
}

function SessionStack() {
  const { colors, mode } = useTheme();
  return (
    <>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="[sessionId]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="summary/[sessionId]" options={{ gestureEnabled: false }} />
      </Stack>
    </>
  );
}

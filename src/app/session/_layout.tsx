import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useStackOptions, useTransition } from '@/design/transitions';
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
  const { mode } = useTheme();
  const options = useStackOptions('push');
  // The summary replaces the workout without a direction.
  const fade = useTransition('fade');
  return (
    <>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={options}>
        <Stack.Screen name="[sessionId]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="summary/[sessionId]" options={{ gestureEnabled: false, ...fade }} />
      </Stack>
    </>
  );
}

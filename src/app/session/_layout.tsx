import { Stack } from 'expo-router';
import { color } from '@/design/tokens';

export default function SessionLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
      <Stack.Screen name="[sessionId]" options={{ gestureEnabled: false }} />
      <Stack.Screen name="summary/[sessionId]" options={{ gestureEnabled: false }} />
    </Stack>
  );
}

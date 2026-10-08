import { Stack } from 'expo-router';
import { color } from '@/design/tokens';

export default function ModalsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />
  );
}

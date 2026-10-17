import { Stack } from 'expo-router';
import { useStackOptions } from '@/design/transitions';

/** The modal group rises from the bottom (root layout); pages inside it slide like any stack. */
export default function ModalsLayout() {
  return <Stack screenOptions={useStackOptions('push')} />;
}

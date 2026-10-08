import * as Haptics from 'expo-haptics';
import { useAppearanceStore } from '@/design/appearance-store';

/** Light tick on taps. Respects the "Haptics" accessibility setting. */
export function tick() {
  if (!useAppearanceStore.getState().haptics) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** Stronger confirmation, e.g. a set checked off. */
export function confirm() {
  if (!useAppearanceStore.getState().haptics) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

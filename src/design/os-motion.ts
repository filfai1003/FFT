import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';

/**
 * The phone's own "reduce motion" (iOS Reduce Motion, Android "Remove animations"). Read once at
 * start and kept up to date; useTheme() combines it with the app's own setting.
 */
export const useOsReduceMotion = create<{ value: boolean }>(() => ({ value: false }));

let started = false;

/** Starts listening to the phone's setting (idempotent; called by useTheme). */
export function watchOsReduceMotion() {
  if (started) return;
  started = true;
  const set = (value: boolean) => useOsReduceMotion.setState({ value: value === true });
  try {
    void AccessibilityInfo.isReduceMotionEnabled?.()
      .then(set)
      .catch(() => undefined);
    AccessibilityInfo.addEventListener?.('reduceMotionChanged', set);
  } catch {
    // Not available (web without matchMedia, tests): the app's own setting still applies.
  }
}

import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * The rest countdown in an ongoing Android notification (native module in ./android). Elsewhere
 * (web, iOS, tests, an older APK without the module) both calls do nothing.
 */
type RestTimerNative = {
  show(endsAtMs: number, title: string, body: string, channelName: string): void;
  hide(): void;
};

const native = requireOptionalNativeModule<RestTimerNative>('RestTimer');

export function showRestTimer(endsAtMs: number, title: string, body: string, channelName: string) {
  try {
    native?.show(endsAtMs, title, body, channelName);
  } catch {
    // The in-app timer still works.
  }
}

export function hideRestTimer() {
  try {
    native?.hide();
  } catch {
    // Nothing to hide.
  }
}

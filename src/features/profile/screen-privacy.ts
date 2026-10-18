import * as ScreenCapture from 'expo-screen-capture';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { usePrivacyStore } from './privacy-store';

/**
 * Keeps sensitive screens out of screenshots, screen recordings and the recent-apps preview
 * (DECISIONS 95; Android FLAG_SECURE through expo-screen-capture). Screen readers and other
 * accessibility services are not affected. Two sources: screens showing progress photos (on by
 * default, "protectPhotos") and the whole app ("hideContent", off by default). Counted, so a
 * screen closing does not lift the protection another one still needs.
 */
let photoScreens = 0;
let wholeApp = false;
let applied = false;

function apply() {
  if (Platform.OS === 'web') return;
  const want = wholeApp || (photoScreens > 0 && usePrivacyStore.getState().protectPhotos);
  if (want === applied) return;
  applied = want;
  const call = want
    ? ScreenCapture.preventScreenCaptureAsync
    : ScreenCapture.allowScreenCaptureAsync;
  void call('fft').catch(() => undefined);
}

/** Protects the current screen while it shows progress photos (`active`). */
export function usePhotoScreenPrivacy(active = true) {
  const protect = usePrivacyStore((s) => s.protectPhotos);
  useEffect(() => {
    if (!active) return;
    photoScreens += 1;
    apply();
    return () => {
      photoScreens -= 1;
      apply();
    };
  }, [active, protect]);
}

/** The whole app, from the setting (mounted once at the root). */
export function useAppScreenPrivacy() {
  const hide = usePrivacyStore((s) => s.hideContent);
  useEffect(() => {
    wholeApp = hide;
    apply();
  }, [hide]);
}

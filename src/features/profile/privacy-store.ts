import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Minutes in the background after which the app lock asks again (DECISIONS 95). */
export const LOCK_AFTER_OPTIONS = [1, 5, 15] as const;
export type LockAfter = (typeof LOCK_AFTER_OPTIONS)[number];

/** Privacy of this device (it protects what is shown on THIS screen): photos, app lock, screen. */
type State = {
  /** Photos are blurred until you tap them. */
  blurPhotos: boolean;
  /** Showing a photo asks for Face ID / the device code first. */
  lockPhotos: boolean;
  /** Method used when the body-fat percentage is logged ("keep it the same"). */
  bodyFatMethod: 'scale' | 'calipers' | 'tape';
  /** The whole app asks for Face ID / fingerprint / device code at start and after a while away. */
  appLock: boolean;
  /** Minutes in the background before the app lock asks again. */
  lockAfterMin: LockAfter;
  /** Screens with progress photos are kept out of screenshots, recordings and recent apps. */
  protectPhotos: boolean;
  /** The whole app is kept out of screenshots and hidden in recent apps. */
  hideContent: boolean;
  set: <
    K extends
      | 'blurPhotos'
      | 'lockPhotos'
      | 'bodyFatMethod'
      | 'appLock'
      | 'lockAfterMin'
      | 'protectPhotos'
      | 'hideContent',
  >(
    key: K,
    value: State[K],
  ) => void;
};

export const usePrivacyStore = create<State>()(
  persist(
    (set) => ({
      blurPhotos: true,
      lockPhotos: false,
      bodyFatMethod: 'scale',
      appLock: false,
      lockAfterMin: 1,
      protectPhotos: true,
      hideContent: false,
      set: (key, value) => set({ [key]: value } as Partial<State>),
    }),
    {
      name: 'fft.privacy.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        blurPhotos: s.blurPhotos,
        lockPhotos: s.lockPhotos,
        bodyFatMethod: s.bodyFatMethod,
        appLock: s.appLock,
        lockAfterMin: s.lockAfterMin,
        protectPhotos: s.protectPhotos,
        hideContent: s.hideContent,
      }),
    },
  ),
);

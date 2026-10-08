import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Photo privacy, kept on this device (it protects what is shown on THIS screen). */
type State = {
  /** Photos are blurred until you tap them. */
  blurPhotos: boolean;
  /** Showing a photo asks for Face ID / the device code first. */
  lockPhotos: boolean;
  /** Method used when the body-fat percentage is logged ("keep it the same"). */
  bodyFatMethod: 'scale' | 'calipers' | 'tape';
  set: <K extends 'blurPhotos' | 'lockPhotos' | 'bodyFatMethod'>(key: K, value: State[K]) => void;
};

export const usePrivacyStore = create<State>()(
  persist(
    (set) => ({
      blurPhotos: true,
      lockPhotos: false,
      bodyFatMethod: 'scale',
      set: (key, value) => set({ [key]: value } as Partial<State>),
    }),
    {
      name: 'fft.privacy.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        blurPhotos: s.blurPhotos,
        lockPhotos: s.lockPhotos,
        bodyFatMethod: s.bodyFatMethod,
      }),
    },
  ),
);

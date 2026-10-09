import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/** black = plain black, dots = the Nothing-style dot grid. */
export type BackgroundMode = 'black' | 'dots';

const KEY = 'fft.background';
const modes: readonly BackgroundMode[] = ['black', 'dots'];

type State = {
  mode: BackgroundMode;
  loaded: boolean;
  load: () => Promise<void>;
  setMode: (mode: BackgroundMode) => void;
};

/** The background behind every screen. A per-device choice, saved on this device. */
export const useBackground = create<State>((set) => ({
  mode: 'dots',
  loaded: false,
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      // Anything else saved (the removed animated backgrounds) becomes the dots.
      set({ mode: modes.find((m) => m === raw) ?? 'dots', loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  setMode: (mode) => {
    set({ mode });
    AsyncStorage.setItem(KEY, mode).catch(() => undefined);
  },
}));

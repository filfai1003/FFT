import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/** black = plain black, dots = the Nothing-style dot grid, waves = the grid with waves rippling through it. */
export type BackgroundMode = 'black' | 'dots' | 'waves';

const KEY = 'fft.background';
const modes: readonly BackgroundMode[] = ['black', 'dots', 'waves'];

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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/** black = plain black, dots = the Nothing-style dot grid, waves = the grid with waves rippling through it. */
export type BackgroundMode = 'black' | 'dots' | 'waves';

/**
 * Whether the waves ran fine on this phone. They are marked `trying` while they start and `ok` a few
 * seconds later; if the app is found still `trying` at the next start, it crashed with them on, so
 * they are switched off for good (`failed`) and the plain dots are used.
 */
export type WavesHealth = 'untested' | 'trying' | 'ok' | 'failed';

const KEY = 'fft.background';
const HEALTH_KEY = 'fft.waves-health-2';
const modes: readonly BackgroundMode[] = ['black', 'dots', 'waves'];

type State = {
  mode: BackgroundMode;
  health: WavesHealth;
  loaded: boolean;
  load: () => Promise<void>;
  setMode: (mode: BackgroundMode) => void;
  setHealth: (health: WavesHealth) => void;
};

const remember = (key: string, value: string) =>
  AsyncStorage.setItem(key, value).catch(() => undefined);

/** The background behind every screen. A per-device choice, saved on this device. */
export const useBackground = create<State>((set) => ({
  mode: 'dots',
  health: 'untested',
  loaded: false,
  load: async () => {
    try {
      const [raw, health] = await Promise.all([
        AsyncStorage.getItem(KEY),
        AsyncStorage.getItem(HEALTH_KEY),
      ]);
      // Found `trying`: the last start with waves never reached `ok`.
      const crashed = health === 'trying';
      if (crashed) void remember(HEALTH_KEY, 'failed');
      set({
        mode: modes.find((m) => m === raw) ?? 'dots',
        health: crashed || health === 'failed' ? 'failed' : health === 'ok' ? 'ok' : 'untested',
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
  setMode: (mode) => {
    set({ mode });
    void remember(KEY, mode);
  },
  setHealth: (health) => {
    set({ health });
    void remember(HEALTH_KEY, health);
  },
}));

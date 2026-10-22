import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { BodyView } from './body-card';

/** Storage that never throws: a failed read shows the weight, a failed write is forgotten. */
const safeStorage: StateStorage = {
  getItem: async (key) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // Not saved: the choice lasts until the app closes.
    }
  },
  removeItem: async (key) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // Nothing to do.
    }
  },
};

/** Weight or body fat on the Home weight card, remembered on this device (DECISIONS 128). */
export const useBodyViewStore = create<{ view: BodyView; setView: (v: BodyView) => void }>()(
  persist(
    (set) => ({
      view: 'weight',
      setView: (view) => set({ view }),
    }),
    {
      name: 'fft.home-body-view.v1',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ view: s.view }),
    },
  ),
);

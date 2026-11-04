import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

/**
 * Storage that never throws: a failed read is "nothing saved", a failed write is forgotten. For a
 * store that writes while it hydrates: the web export renders without `window`, and AsyncStorage
 * then rejects with nobody to catch it, which ends the build.
 */
export const safeStorage: StateStorage = {
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
      // Not saved: it lasts until the app closes.
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

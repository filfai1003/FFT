import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = 'fft.creatine-days';

type State = {
  /** Days (YYYY-MM-DD) on which creatine was taken. */
  days: readonly string[];
  loaded: boolean;
  load: () => Promise<void>;
  setTaken: (day: string, taken: boolean) => void;
};

/** Creatine intake, one tick per day. Saved on this device. */
export const useCreatine = create<State>((set, get) => ({
  days: [],
  loaded: false,
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      set({
        days: Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : [],
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
  setTaken: (day, taken) => {
    const rest = get().days.filter((d) => d !== day);
    const days = taken ? [...rest, day].sort() : rest;
    set({ days });
    AsyncStorage.setItem(KEY, JSON.stringify(days)).catch(() => undefined);
  },
}));

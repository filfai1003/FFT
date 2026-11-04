import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safe-storage';
import type { BodyView } from './body-card';

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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActiveSession, SessionRecord, SessionTotals } from './logic';

/** A finished workout waiting for the summary and/or the upload. Kept until it is synced. */
export type FinishedSession = {
  userId: string;
  session: ActiveSession;
  endedAt: string;
  feeling: number | null;
  notes: string;
  records: SessionRecord[];
  totals: SessionTotals;
  synced: boolean;
};

type State = {
  /** The workout in progress (at most one). Saved on every change, survives crashes. */
  active: ActiveSession | null;
  finished: Record<string, FinishedSession>;

  start: (session: ActiveSession) => void;
  update: (fn: (s: ActiveSession) => ActiveSession) => void;
  discard: () => void;
  /** Moves the active workout to `finished` (not yet uploaded). */
  finish: (f: FinishedSession) => void;
  patchFinished: (id: string, patch: Partial<Pick<FinishedSession, 'feeling' | 'notes'>>) => void;
  markSynced: (id: string) => void;
  forget: (id: string) => void;
};

const KEEP_SYNCED = 5;

export const useSessionStore = create<State>()(
  persist(
    (set, get) => ({
      active: null,
      finished: {},

      start: (session) => set({ active: session }),
      update: (fn) => {
        const active = get().active;
        if (active) set({ active: fn(active) });
      },
      discard: () => set({ active: null }),
      finish: (f) => set({ active: null, finished: { ...get().finished, [f.session.id]: f } }),
      patchFinished: (id, patch) => {
        const f = get().finished[id];
        // Changed after an upload: it has to be uploaded again (the upsert replaces the row).
        if (f) set({ finished: { ...get().finished, [id]: { ...f, ...patch, synced: false } } });
      },
      markSynced: (id) => {
        const finished = { ...get().finished };
        if (finished[id]) finished[id] = { ...finished[id], synced: true };
        // Keep only the last few uploaded ones (the summary may still be open).
        const syncedIds = Object.values(finished)
          .filter((f) => f.synced)
          .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
          .slice(KEEP_SYNCED)
          .map((f) => f.session.id);
        for (const old of syncedIds) delete finished[old];
        set({ finished });
      },
      forget: (id) => {
        const { [id]: _removed, ...rest } = get().finished;
        set({ finished: rest });
      },
    }),
    {
      name: 'fft.workout-session.v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ active: s.active, finished: s.finished }),
    },
  ),
);

/** True once the saved session has been read back from storage (after an app restart). */
export function useSessionHydrated(): boolean {
  return useSyncExternalStore(
    (notify) => useSessionStore.persist.onFinishHydration(notify),
    () => useSessionStore.persist.hasHydrated(),
    () => false,
  );
}

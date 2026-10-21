import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * One-time explanations, each shown until dismissed (per device): the Home tips and the
 * first-use cards of Train, the workout, Diet, Progress and Community (DECISIONS 124).
 */
export type HintId =
  'todayTips' | 'trainTips' | 'workoutTips' | 'dietTips' | 'progressTips' | 'communityTips';

type State = {
  seen: Partial<Record<HintId, true>>;
  /** The saved state has been read: before that nothing is shown (no flash of a seen hint). */
  hydrated: boolean;
  dismiss: (id: HintId) => void;
};

export const useHintsStore = create<State>()(
  persist(
    (set) => ({
      seen: {},
      hydrated: false,
      dismiss: (id) => set((s) => ({ seen: { ...s.seen, [id]: true } })),
    }),
    {
      name: 'fft.hints.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ seen: s.seen }),
      onRehydrateStorage: () => () => useHintsStore.setState({ hydrated: true }),
    },
  ),
);

/** True while the hint should show: read from storage and not dismissed yet. */
export function useHint(id: HintId): boolean {
  return useHintsStore((s) => s.hydrated && !s.seen[id]);
}

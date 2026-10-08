import { create } from 'zustand';
import type { Pose } from './data';

/** Photos taken for the check-in being filled (local URIs, uploaded when it is saved). */
type State = {
  photos: Partial<Record<Pose, string>>;
  set: (pose: Pose, uri: string) => void;
  clear: () => void;
};

export const usePhotoDraft = create<State>((set, get) => ({
  photos: {},
  set: (pose, uri) => set({ photos: { ...get().photos, [pose]: uri } }),
  clear: () => set({ photos: {} }),
}));

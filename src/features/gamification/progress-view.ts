import { create } from 'zustand';

export type ProgressView = 'me' | 'community';

/** Which half of Progress is open ("Me" / "Community"); "See badges" switches back to Me. */
export const useProgressView = create<{ view: ProgressView; setView: (v: ProgressView) => void }>(
  (set) => ({ view: 'me', setView: (view) => set({ view }) }),
);

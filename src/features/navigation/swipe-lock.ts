import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Reasons the swipe between tabs is off right now (e.g. the Today page in edit mode, where cards
 * are dragged). Any reason turns it off.
 */
export const useTabSwipeLock = create<{ reasons: readonly string[] }>(() => ({ reasons: [] }));

export function lockTabSwipe(reason: string) {
  const { reasons } = useTabSwipeLock.getState();
  if (!reasons.includes(reason)) useTabSwipeLock.setState({ reasons: [...reasons, reason] });
}

export function unlockTabSwipe(reason: string) {
  const { reasons } = useTabSwipeLock.getState();
  if (reasons.includes(reason))
    useTabSwipeLock.setState({ reasons: reasons.filter((r) => r !== reason) });
}

/** Turns the swipe between tabs off while `active` (and on again when the caller unmounts). */
export function useBlockTabSwipe(reason: string, active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockTabSwipe(reason);
    return () => unlockTabSwipe(reason);
  }, [reason, active]);
}

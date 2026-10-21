import { create } from 'zustand';

export const TOAST_DURATION_MS = 5000;

export type ToastOptions = {
  message: string;
  /** Label of the action button, usually "Undo". */
  actionLabel?: string;
  /** Called when the action is pressed (e.g. revert the change). */
  onAction?: () => void;
  durationMs?: number;
  /**
   * Space above the bottom edge (safe area included). Left out, the toast finds the page's
   * bottom bar itself: the tab bar, or a BottomActionBar (DECISIONS 123).
   */
  bottomOffset?: number;
  /** `top`: under the status bar, for the one place where the bottom is the work area (sets). */
  placement?: 'top' | 'bottom';
};

export type Toast = ToastOptions & { id: number };

type State = {
  toast: Toast | null;
  show: (options: ToastOptions) => number;
  /** Runs the action (if any) and closes. */
  runAction: (id: number) => void;
  dismiss: (id?: number) => void;
};

let nextId = 1;

/** One toast at a time: a new one replaces the previous. */
export const useToastStore = create<State>((set, get) => ({
  toast: null,
  show: (options) => {
    const id = nextId++;
    set({ toast: { ...options, id } });
    return id;
  },
  runAction: (id) => {
    const toast = get().toast;
    if (!toast || toast.id !== id) return;
    set({ toast: null });
    toast.onAction?.();
  },
  dismiss: (id) => {
    const toast = get().toast;
    if (!toast || (id != null && toast.id !== id)) return;
    set({ toast: null });
  },
}));

/**
 * The fixed bars at the bottom of the pages on screen (their full height, safe area included),
 * newest last: the toast sits just above the newest one (DECISIONS 123).
 */
export const useBottomBars = create<{ heights: number[] }>(() => ({ heights: [] }));

/** A bottom bar says it is on screen; the returned function takes it away. */
export function registerBottomBar(height: number): () => void {
  useBottomBars.setState((s) => ({ heights: [...s.heights, height] }));
  return () =>
    useBottomBars.setState((s) => {
      const i = s.heights.lastIndexOf(height);
      return { heights: i < 0 ? s.heights : [...s.heights.slice(0, i), ...s.heights.slice(i + 1)] };
    });
}

/** Imperative helper for non-component code: `showUndoToast('Set saved', undo)`. */
export function showUndoToast(
  message: string,
  onUndo: () => void,
  options: Omit<ToastOptions, 'message' | 'onAction'> & { actionLabel: string },
) {
  return useToastStore.getState().show({ message, onAction: onUndo, ...options });
}

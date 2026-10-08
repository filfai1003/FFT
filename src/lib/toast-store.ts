import { create } from 'zustand';

export const TOAST_DURATION_MS = 5000;

export type ToastOptions = {
  message: string;
  /** Label of the action button, usually "Undo". */
  actionLabel?: string;
  /** Called when the action is pressed (e.g. revert the change). */
  onAction?: () => void;
  durationMs?: number;
  /** Extra space above the bottom edge, to sit over a fixed bar. */
  bottomOffset?: number;
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

/** Imperative helper for non-component code: `showUndoToast('Set saved', undo)`. */
export function showUndoToast(
  message: string,
  onUndo: () => void,
  options: Omit<ToastOptions, 'message' | 'onAction'> & { actionLabel: string },
) {
  return useToastStore.getState().show({ message, onAction: onUndo, ...options });
}

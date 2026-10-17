import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetName } from './snapshot';

/**
 * What the widgets remember between taps, besides the data: the last quick action that can be
 * undone (shown with an Undo button for a few seconds), the weight being set with − / + before
 * Save, and a short message (an error, or "open the app"). Kept on this device (AsyncStorage).
 */

/** How long a quick action can be undone from the widget (as the app's toasts). */
export const UNDO_MS = 5000;
/** How long a message stays on a widget. */
export const NOTICE_MS = 8000;

export type UndoAction =
  | {
      kind: 'meal';
      day: string;
      mealId: string;
      before: {
        status: 'done' | 'adjusted' | 'skipped';
        kcal: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
      } | null;
    }
  | { kind: 'water'; id: string }
  | { kind: 'foods'; ids: string[] }
  | { kind: 'weight'; entryId: string; created: boolean; beforeKg: number | null }
  | { kind: 'set'; sessionId: string; setId: string };

export type WidgetUndo = {
  id: string;
  widget: WidgetName;
  /** Already translated: "Lunch marked as followed". */
  message: string;
  action: UndoAction;
  until: number;
};

export type WidgetState = {
  undo: WidgetUndo | null;
  /** Weight shown by − / + before Save, in tenths of the user's unit (80.2 kg = 802). */
  weightDraft: { userId: string; day: string; tenths: number } | null;
  notice: { widget: WidgetName; text: string; until: number } | null;
};

export const emptyState: WidgetState = { undo: null, weightDraft: null, notice: null };

const KEY = 'fft.widgets.state';

export async function readState(): Promise<WidgetState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...emptyState, ...(JSON.parse(raw) as Partial<WidgetState>) } : emptyState;
  } catch {
    return emptyState;
  }
}

export async function saveState(s: WidgetState) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Only the Undo button or the draft weight are lost.
  }
}

/** What a widget shows now: expired undo and messages are left out. */
export function liveState(s: WidgetState, now: number): WidgetState {
  return {
    undo: s.undo && s.undo.until > now ? s.undo : null,
    weightDraft: s.weightDraft,
    notice: s.notice && s.notice.until > now ? s.notice : null,
  };
}

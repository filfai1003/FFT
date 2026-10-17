import { create } from 'zustand';
import { sameLayout, useHomeLayout, type HomeLayout } from './layout-store';

/**
 * Today's edit mode (DECISIONS 72): changes go to a draft; "Done" saves it, and the layout from
 * before can be brought back (undo toast).
 */
type EditState = {
  /** The layout being edited (null = not editing). */
  draft: HomeLayout | null;
  /** The saved layout when editing started. */
  before: HomeLayout | null;
};

export const useTodayEdit = create<EditState>(() => ({ draft: null, before: null }));

export function startTodayEdit() {
  if (useTodayEdit.getState().draft) return;
  const { widgets, aiDock } = useHomeLayout.getState();
  const layout = { widgets, aiDock };
  useTodayEdit.setState({ draft: layout, before: layout });
}

export function changeTodayDraft(change: (draft: HomeLayout) => HomeLayout) {
  const { draft } = useTodayEdit.getState();
  if (draft) useTodayEdit.setState({ draft: change(draft) });
}

/**
 * Leaves edit mode and saves the draft. Returns the layout from before when something changed
 * (for the undo toast), else null.
 */
export function finishTodayEdit(): HomeLayout | null {
  const { draft, before } = useTodayEdit.getState();
  useTodayEdit.setState({ draft: null, before: null });
  if (!draft || !before) return null;
  useHomeLayout.getState().setLayout(draft);
  return sameLayout(draft, before) ? null : before;
}

/** Undo: puts back the layout from before the edit. */
export function restoreTodayLayout(layout: HomeLayout) {
  useHomeLayout.getState().setLayout(layout);
}

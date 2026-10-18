import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type WidgetId = 'nutrition' | 'workout' | 'water' | 'weight' | 'streak' | 'supplements';
/** small = half the width (two side by side), large = the whole width. */
export type WidgetSize = 'small' | 'large';
export type WidgetItem = { id: WidgetId; size: WidgetSize; visible: boolean };

export const defaultWidgets: readonly WidgetItem[] = [
  { id: 'nutrition', size: 'large', visible: true },
  { id: 'workout', size: 'large', visible: true },
  { id: 'water', size: 'small', visible: true },
  { id: 'weight', size: 'small', visible: true },
  // Streak and next badge (canvas Home, DECISIONS 89).
  { id: 'streak', size: 'large', visible: true },
  { id: 'supplements', size: 'small', visible: true },
];

export type HomeLayout = { widgets: readonly WidgetItem[]; aiDock: boolean };

const KEY = 'fft.home-layout';
/**
 * Saved format. 1 = the Customize sheet's (no version field); 2 = the edit mode's (DECISIONS 72).
 * Same shape, so a saved v1 layout is read as is: order, sizes and hidden cards are kept.
 */
export const LAYOUT_VERSION = 2;

/** Saved layouts may miss new widgets or hold removed ones: keep order, add the rest. */
export function mergeLayout(saved: unknown): HomeLayout {
  const raw = (saved ?? {}) as { widgets?: Partial<WidgetItem>[]; aiDock?: unknown };
  const known = new Map(defaultWidgets.map((w) => [w.id, w]));
  const out: WidgetItem[] = [];
  for (const w of raw.widgets ?? []) {
    // The Creatine widget became Supplements (same place, same size); the calendar one is gone.
    const id = (w.id as string | undefined) === 'creatine' ? 'supplements' : w.id;
    const base = id ? known.get(id) : undefined;
    if (!base || out.some((o) => o.id === base.id)) continue;
    out.push({
      id: base.id,
      size: w.size === 'small' || w.size === 'large' ? w.size : base.size,
      visible: typeof w.visible === 'boolean' ? w.visible : base.visible,
    });
  }
  for (const w of defaultWidgets) if (!out.some((o) => o.id === w.id)) out.push({ ...w });
  return { widgets: out, aiDock: typeof raw.aiDock === 'boolean' ? raw.aiDock : false };
}

/** What is written to storage. */
export function serializeLayout(layout: HomeLayout): string {
  return JSON.stringify({
    version: LAYOUT_VERSION,
    widgets: layout.widgets,
    aiDock: layout.aiDock,
  });
}

/** Moves the widget at `index` by `delta` places (clamped). */
export function moveWidget(
  widgets: readonly WidgetItem[],
  index: number,
  delta: number,
): readonly WidgetItem[] {
  const to = Math.min(widgets.length - 1, Math.max(0, index + delta));
  if (to === index) return widgets;
  const next = [...widgets];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Moves a widget to the place of another (drag and drop), the others keep their order. */
export function moveWidgetTo(
  widgets: readonly WidgetItem[],
  id: WidgetId,
  targetId: WidgetId,
): readonly WidgetItem[] {
  const from = widgets.findIndex((w) => w.id === id);
  const to = widgets.findIndex((w) => w.id === targetId);
  if (from < 0 || to < 0 || from === to) return widgets;
  return moveWidget(widgets, from, to - from);
}

/**
 * Moves a widget among the SHOWN ones by `delta` places (screen reader "move up / down"): hidden
 * ones in between are skipped, so every action visibly moves the card.
 */
export function moveShown(
  widgets: readonly WidgetItem[],
  id: WidgetId,
  delta: -1 | 1,
): readonly WidgetItem[] {
  const shown = widgets.filter((w) => w.visible);
  const at = shown.findIndex((w) => w.id === id);
  const target = shown[at + delta];
  if (at < 0 || !target) return widgets;
  return moveWidgetTo(widgets, id, target.id);
}

export function updateWidget(
  widgets: readonly WidgetItem[],
  id: WidgetId,
  patch: Partial<Pick<WidgetItem, 'size' | 'visible'>>,
): readonly WidgetItem[] {
  return widgets.map((w) => (w.id === id ? { ...w, ...patch } : w));
}

/** A card added back from the tray goes at the end of the shown ones. */
export function showWidget(widgets: readonly WidgetItem[], id: WidgetId): readonly WidgetItem[] {
  const item = widgets.find((w) => w.id === id);
  if (!item) return widgets;
  const rest = widgets.filter((w) => w.id !== id);
  const lastShown = rest.reduce((last, w, i) => (w.visible ? i : last), -1);
  const next = [...rest];
  next.splice(lastShown + 1, 0, { ...item, visible: true });
  return next;
}

export function sameLayout(a: HomeLayout, b: HomeLayout): boolean {
  return serializeLayout(a) === serializeLayout(b);
}

type State = HomeLayout & {
  loaded: boolean;
  load: () => Promise<void>;
  setLayout: (layout: HomeLayout) => void;
  setWidgets: (widgets: readonly WidgetItem[]) => void;
  setAiDock: (visible: boolean) => void;
};

const persist = (s: HomeLayout) =>
  AsyncStorage.setItem(KEY, serializeLayout(s)).catch(() => undefined);

/** What the Today screen shows, in which order and how big. Saved on this device only. */
export const useHomeLayout = create<State>((set, get) => ({
  ...mergeLayout(null),
  loaded: false,
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      set({ ...mergeLayout(raw ? JSON.parse(raw) : null), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  setLayout: ({ widgets, aiDock }) => {
    set({ widgets, aiDock });
    void persist(get());
  },
  setWidgets: (widgets) => {
    set({ widgets });
    void persist(get());
  },
  setAiDock: (aiDock) => {
    set({ aiDock });
    void persist(get());
  },
}));

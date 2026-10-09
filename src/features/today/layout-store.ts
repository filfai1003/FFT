import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type WidgetId = 'nutrition' | 'workout' | 'water' | 'creatine' | 'calendar';
export type WidgetSize = 'small' | 'large';
export type WidgetItem = { id: WidgetId; size: WidgetSize; visible: boolean };

export const defaultWidgets: readonly WidgetItem[] = [
  { id: 'nutrition', size: 'large', visible: true },
  { id: 'workout', size: 'large', visible: true },
  { id: 'water', size: 'small', visible: true },
  { id: 'creatine', size: 'small', visible: true },
  { id: 'calendar', size: 'small', visible: false },
];

type HomeLayout = { widgets: readonly WidgetItem[]; aiDock: boolean };

const KEY = 'fft.home-layout';

/** Saved layouts may miss new widgets or hold removed ones: keep order, add the rest. */
export function mergeLayout(saved: unknown): HomeLayout {
  const raw = (saved ?? {}) as { widgets?: Partial<WidgetItem>[]; aiDock?: unknown };
  const known = new Map(defaultWidgets.map((w) => [w.id, w]));
  const out: WidgetItem[] = [];
  for (const w of raw.widgets ?? []) {
    const base = w.id ? known.get(w.id) : undefined;
    if (!base || out.some((o) => o.id === base.id)) continue;
    out.push({
      id: base.id,
      size: w.size === 'small' || w.size === 'large' ? w.size : base.size,
      visible: typeof w.visible === 'boolean' ? w.visible : base.visible,
    });
  }
  for (const w of defaultWidgets) if (!out.some((o) => o.id === w.id)) out.push({ ...w });
  return { widgets: out, aiDock: typeof raw.aiDock === 'boolean' ? raw.aiDock : true };
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

type State = HomeLayout & {
  loaded: boolean;
  load: () => Promise<void>;
  setWidgets: (widgets: readonly WidgetItem[]) => void;
  setAiDock: (visible: boolean) => void;
};

const persist = (s: HomeLayout) =>
  AsyncStorage.setItem(KEY, JSON.stringify({ widgets: s.widgets, aiDock: s.aiDock })).catch(
    () => undefined,
  );

/** What the Today screen shows, in which order and how big. Saved on this device. */
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
  setWidgets: (widgets) => {
    set({ widgets });
    void persist(get());
  },
  setAiDock: (aiDock) => {
    set({ aiDock });
    void persist(get());
  },
}));

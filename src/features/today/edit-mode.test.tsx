import '@/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from '@/components/ui/Text';
import { useAppearanceStore } from '@/design/appearance-store';
import { renderUI } from '@/test/render';
import { dropTarget } from './edit-grid';
import {
  changeTodayDraft,
  finishTodayEdit,
  restoreTodayLayout,
  startTodayEdit,
  useTodayEdit,
} from './edit-store';
import {
  defaultWidgets,
  LAYOUT_VERSION,
  mergeLayout,
  moveShown,
  serializeLayout,
  showWidget,
  updateWidget,
  useHomeLayout,
  type WidgetItem,
} from './layout-store';
import { TodayGrid } from './TodayGrid';

const ids = (ws: readonly WidgetItem[]) => ws.map((w) => w.id);

describe('Today layout: saved format', () => {
  it('a layout saved by the old Customize sheet is read as is', () => {
    const v1 = {
      widgets: [
        { id: 'water', size: 'large', visible: true },
        { id: 'nutrition', size: 'small', visible: false },
      ],
      aiDock: true,
    };
    const layout = mergeLayout(JSON.parse(JSON.stringify(v1)));
    expect(layout.widgets.slice(0, 2)).toEqual(v1.widgets);
    expect(layout.aiDock).toBe(true);
    // Written back with the version, and read again identically.
    const written = JSON.parse(serializeLayout(layout));
    expect(written.version).toBe(LAYOUT_VERSION);
    expect(mergeLayout(written)).toEqual(layout);
  });

  it('loads what the store saved', async () => {
    useHomeLayout.getState().setLayout({
      widgets: updateWidget(defaultWidgets, 'weight', { visible: false }),
      aiDock: true,
    });
    await new Promise((r) => setTimeout(r, 0));
    useHomeLayout.setState({ ...mergeLayout(null), loaded: false });
    await useHomeLayout.getState().load();
    expect(useHomeLayout.getState().widgets.find((w) => w.id === 'weight')?.visible).toBe(false);
    expect(useHomeLayout.getState().aiDock).toBe(true);
    await AsyncStorage.clear();
  });
});

describe('Today layout: edits', () => {
  it('moves among the shown cards, skipping hidden ones', () => {
    const ws = updateWidget(defaultWidgets, 'water', { visible: false });
    // workout, (water hidden), weight: moving workout down lands after weight.
    expect(ids(moveShown(ws, 'workout', 1))).toEqual([
      'nutrition',
      'water',
      'weight',
      'workout',
      'streak',
      'supplements',
    ]);
    expect(moveShown(ws, 'nutrition', -1)).toBe(ws);
  });

  it('a card added back goes after the last shown one', () => {
    let ws = updateWidget(defaultWidgets, 'nutrition', { visible: false });
    ws = showWidget(ws, 'nutrition');
    expect(ids(ws).at(-1)).toBe('nutrition');
    expect(ws.find((w) => w.id === 'nutrition')?.visible).toBe(true);
  });

  it('drops on the card under the centre, else the nearest', () => {
    const rects = [
      { id: 'a', x: 0, y: 0, w: 100, h: 100 },
      { id: 'b', x: 110, y: 0, w: 100, h: 100 },
      { id: 'c', x: 0, y: 110, w: 210, h: 100 },
    ];
    expect(dropTarget(rects, 'a', 150, 50)).toBe('b');
    expect(dropTarget(rects, 'a', 105, 160)).toBe('c');
    expect(dropTarget(rects, 'a', 50, 50)).toBe('a');
    expect(dropTarget(rects, 'a', 400, 20)).toBe('b');
  });
});

describe('Today edit mode: save and undo', () => {
  beforeEach(() => useHomeLayout.setState({ ...mergeLayout(null), loaded: true }));

  it('Done saves the draft and gives back the layout from before for the undo', () => {
    startTodayEdit();
    changeTodayDraft((d) => ({
      ...d,
      widgets: updateWidget(d.widgets, 'water', { size: 'large' }),
    }));
    // Nothing saved while editing.
    expect(useHomeLayout.getState().widgets.find((w) => w.id === 'water')?.size).toBe('small');
    const before = finishTodayEdit();
    expect(useTodayEdit.getState().draft).toBeNull();
    expect(useHomeLayout.getState().widgets.find((w) => w.id === 'water')?.size).toBe('large');
    expect(before).not.toBeNull();
    restoreTodayLayout(before!);
    expect(useHomeLayout.getState().widgets).toEqual(defaultWidgets);
  });

  it('nothing changed: no undo', () => {
    startTodayEdit();
    expect(finishTodayEdit()).toBeNull();
  });
});

function Harness({ editing }: { editing: boolean }) {
  const [widgets, setWidgets] = useState<readonly WidgetItem[]>(defaultWidgets);
  return (
    <>
      <TodayGrid
        widgets={widgets}
        editing={editing}
        onEnterEdit={jest.fn()}
        onChange={setWidgets}
        aiDock={false}
        onAiDock={jest.fn()}
        renderWidget={(w) => <Text>{`card-${w.id}`}</Text>}
      />
      <Text testID="order">{widgets.map((w) => `${w.id}:${w.size}:${w.visible}`).join(',')}</Text>
    </>
  );
}

const order = () => String(screen.getByTestId('order').props.children);

describe('Today edit mode: the grid', () => {
  afterEach(async () => {
    await act(() => useAppearanceStore.getState().reset());
  });

  it('outside edit mode the cards work as usual and there is no tray', async () => {
    await renderUI(<Harness editing={false} />);
    expect(screen.getByText('card-water')).toBeTruthy();
    expect(screen.queryByText('Add cards')).toBeNull();
  });

  it('screen readers can move, resize and hide a card; hidden cards come back from the tray', async () => {
    await act(() => useAppearanceStore.getState().set('reduceMotion', true));
    await renderUI(<Harness editing />);
    const water = screen.getByLabelText('Water, Half width');
    const actions = (water.props.accessibilityActions as { name: string }[]).map((a) => a.name);
    expect(actions).toEqual(['moveUp', 'moveDown', 'resize', 'hide']);

    await fireEvent(water, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    expect(order().startsWith('nutrition:large:true,water')).toBe(true);
    await fireEvent(screen.getByLabelText('Water, Half width'), 'accessibilityAction', {
      nativeEvent: { actionName: 'resize' },
    });
    expect(order()).toContain('water:large:true');
    await fireEvent.press(screen.getByLabelText('Hide Weight'));
    expect(order()).toContain('weight:small:false');
    // The content of a card is out of reach while editing; the tray lists the hidden one.
    expect(screen.queryByText('card-water')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Add Weight'));
    expect(order()).toContain('weight:small:true');
  });
});

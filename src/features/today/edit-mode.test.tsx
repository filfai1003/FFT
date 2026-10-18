import '@/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useAppearanceStore } from '@/design/appearance-store';
import { renderUI } from '@/test/render';
import { dropRows, gridGeometry, packRows, rowsKey, rowsToShown } from './edit-grid';
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

  describe('home screen placement', () => {
    // 210 wide, gap 10: half-width cards are 100 wide; every card 100 tall. Rows (top):
    // nutrition 0, workout 110, water|weight 220, streak 330, supplements|_ 440.
    const rows = packRows(defaultWidgets);
    const heights = new Map(defaultWidgets.map((w) => [w.id, 100]));
    const { bands } = gridGeometry(rows, 210, 10, heights);
    const item = (id: string) => defaultWidgets.find((w) => w.id === id)!;
    const drop = (id: string, cx: number, cy: number) =>
      rowsKey(dropRows(rows, bands, item(id), cx, cy, 210));

    it('lays the cards out in rows with left and right slots', () => {
      expect(rowsKey(rows)).toBe('nutrition,workout,water|weight,streak,supplements|_');
      expect(bands.map((b) => b.top)).toEqual([0, 110, 220, 330, 440]);
    });

    it('a half-width card takes the slot under it; the one there moves aside or down', () => {
      // Free slot: it just goes there.
      expect(drop('weight', 160, 490)).toBe('nutrition,workout,water|_,streak,supplements|weight');
      // Next to its partner: the two swap.
      expect(drop('water', 160, 270)).toBe('nutrition,workout,weight|water,streak,supplements|_');
      // Both slots taken: the card there goes down to the same slot of a new row.
      expect(drop('supplements', 160, 270)).toBe(
        'nutrition,workout,water|supplements,_|weight,streak',
      );
      // Over a wide card: a new row above or below it, in the slot under the finger.
      expect(drop('supplements', 160, 120)).toBe(
        'nutrition,_|supplements,workout,water|weight,streak',
      );
    });

    it('a wide card goes above or below the row under it', () => {
      expect(drop('nutrition', 100, 400)).toBe(
        'workout,water|weight,streak,nutrition,supplements|_',
      );
      expect(drop('streak', 100, 230)).toBe('nutrition,workout,streak,water|weight,supplements|_');
      expect(drop('nutrition', 100, 700)).toBe(
        'workout,water|weight,streak,supplements|_,nutrition',
      );
    });

    it('over its own place nothing changes', () => {
      expect(drop('water', 50, 270)).toBe(rowsKey(rows));
      expect(drop('workout', 150, 190)).toBe(rowsKey(rows));
    });

    it('slots are kept: the saved list gives back the same rows', () => {
      const moved = dropRows(rows, bands, item('weight'), 160, 490, 210);
      const saved = rowsToShown(moved, defaultWidgets);
      expect(saved.find((w) => w.id === 'weight')?.col).toBe(1);
      expect(rowsKey(packRows(saved))).toBe(rowsKey(moved));
      expect(
        rowsKey(
          packRows(
            mergeLayout(JSON.parse(serializeLayout({ widgets: saved, aiDock: false }))).widgets,
          ),
        ),
      ).toBe(rowsKey(moved));
    });

    it('a card resized or moved by a screen reader takes the next free slot', () => {
      const saved = rowsToShown(
        dropRows(rows, bands, item('weight'), 160, 490, 210),
        defaultWidgets,
      );
      expect(
        updateWidget(saved, 'weight', { size: 'large' }).find((w) => w.id === 'weight')?.col,
      ).toBeUndefined();
      expect(moveShown(saved, 'weight', -1).find((w) => w.id === 'weight')?.col).toBeUndefined();
    });
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

  it('the remove and size controls sit in a row above the card, never over its content', async () => {
    await act(() => useAppearanceStore.getState().set('oneHandMode', true));
    await renderUI(<Harness editing />);
    const toolbar = screen.getByTestId('edit-toolbar-water', { includeHiddenElements: true });
    // In the flow (not absolutely placed over the card), first in the card, then the content.
    expect(StyleSheet.flatten(toolbar.props.style).position).toBeUndefined();
    const card = toolbar.parent!;
    const kids = card.children.filter((c) => typeof c !== 'string');
    expect(kids[0]).toBe(toolbar);
    // Touch targets: 52 in one-hand mode.
    const hide = screen.getByLabelText('Hide Water');
    expect(StyleSheet.flatten(hide.props.style)).toMatchObject({ width: 52, height: 52 });
    expect(screen.getByLabelText('Make Water full width')).toBeTruthy();
  });
});

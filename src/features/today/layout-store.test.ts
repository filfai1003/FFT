import { defaultWidgets, mergeLayout, moveWidget } from './layout-store';

describe('home layout', () => {
  it('starts from the defaults and keeps a saved order, size and visibility', () => {
    expect(mergeLayout(null).widgets).toEqual(defaultWidgets);
    const saved = mergeLayout({
      widgets: [
        { id: 'water', size: 'large', visible: false },
        { id: 'removed-one', size: 'small', visible: true },
        { id: 'water', size: 'small', visible: true },
      ],
      aiDock: false,
    });
    expect(saved.widgets[0]).toEqual({ id: 'water', size: 'large', visible: false });
    expect(saved.widgets).toHaveLength(defaultWidgets.length);
    expect(saved.aiDock).toBe(false);
  });

  it('moves a widget and stays inside the list', () => {
    expect(moveWidget(defaultWidgets, 0, 1)[1]?.id).toBe(defaultWidgets[0]?.id);
    expect(moveWidget(defaultWidgets, 0, -1)).toBe(defaultWidgets);
  });
});

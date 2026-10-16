import '@/i18n';
// The library's own tree builder: what Android receives. A layout it cannot build is an empty widget.
import { buildWidgetTree } from 'react-native-android-widget/lib/commonjs/api/build-widget-tree';
import type { WidgetSnapshot } from './snapshot';
import { fallbackWidget, widgetFor } from './WidgetViews';

jest.mock('react-native-android-widget/lib/commonjs/NativeAndroidWidget', () => ({}), {
  virtual: true,
});

const snapshot: WidgetSnapshot = {
  day: '2026-10-16',
  calories: {
    eaten: 1200,
    target: 2400,
    macros: [
      { key: 'protein', eaten: 90, target: 160 },
      { key: 'carbs', eaten: 120, target: 280 },
      { key: 'fat', eaten: 40, target: 75 },
    ],
  },
  water: { ml: 750, glassMl: 250, goalGlasses: 8 },
  workout: { kind: 'next', name: 'Push A', exercises: 6 },
  weight: { kg: 80.2, change7: -0.4, day: '2026-10-16' },
  supplements: [
    { name: 'Creatine', taken: true },
    { name: 'Vitamin D', taken: false },
  ],
};

type Node = { type: string; props: Record<string, unknown>; children?: Node[] };
const texts = (n: Node): string[] => [
  ...(n.type === 'TextWidget' ? [String(n.props.text)] : []),
  ...(n.children ?? []).flatMap(texts),
];

describe('home screen widgets', () => {
  it.each(['Calories', 'Workout', 'Water', 'Weight', 'Supplements'])(
    '%s builds in light and dark, with a background',
    (name) => {
      const { light, dark } = widgetFor(name, snapshot);
      for (const jsx of [light, dark]) {
        const tree = buildWidgetTree(jsx) as Node;
        expect(tree.type).toMatch(/^(Flex|LinearLayout)Widget$/);
        expect(JSON.stringify(tree.props)).toContain('backgroundColor');
        expect(texts(tree).length).toBeGreaterThan(1);
      }
    },
  );

  it('shows the numbers', () => {
    const calories = texts(buildWidgetTree(widgetFor('Calories', snapshot).light) as Node);
    expect(calories).toContain('1,200 kcal left');
    const water = texts(buildWidgetTree(widgetFor('Water', snapshot).light) as Node);
    expect(water).toContain('3 / 8');
  });

  it('nothing saved yet, or an unknown widget: still a card, never empty', () => {
    expect((buildWidgetTree(widgetFor('Calories', null).light) as Node).type).toMatch(
      /^(Flex|LinearLayout)Widget$/,
    );
    expect((buildWidgetTree(widgetFor('Other', snapshot).light) as Node).type).toMatch(
      /^(Flex|LinearLayout)Widget$/,
    );
    expect((buildWidgetTree(fallbackWidget()) as Node).type).toMatch(/^(Flex|LinearLayout)Widget$/);
  });
});

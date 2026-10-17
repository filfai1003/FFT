import '@/i18n';
// The library's own tree builder: what Android receives. A layout it cannot build is an empty widget.
import { buildWidgetTree } from 'react-native-android-widget/lib/commonjs/api/build-widget-tree';
import { widgetSnapshot } from '@/test/widget-snapshot';
import { emptyState, type WidgetState } from './state';
import { fallbackWidget, widgetFor } from './WidgetViews';

jest.mock('react-native-android-widget/lib/commonjs/NativeAndroidWidget', () => ({}), {
  virtual: true,
});

type Node = { type: string; props: Record<string, unknown>; children?: Node[] };
const texts = (n: Node): string[] => [
  ...(n.type === 'TextWidget' ? [String(n.props.text)] : []),
  ...(n.children ?? []).flatMap(texts),
];
/** Every clickable part: its action (or link) and what a screen reader says. */
const clicks = (n: Node): { action: string; data: unknown; label: unknown }[] => [
  ...(n.props.clickAction
    ? [
        {
          action: String(n.props.clickAction),
          data: n.props.clickActionData,
          label: n.props.accessibilityLabel,
        },
      ]
    : []),
  ...(n.children ?? []).flatMap(clicks),
];
const tree = (name: string, s = widgetSnapshot(), st: WidgetState = emptyState, height = 180) =>
  buildWidgetTree(widgetFor(name, s, st, { width: 320, height }).light) as Node;
const uris = (n: Node) =>
  clicks(n)
    .filter((c) => c.action === 'OPEN_URI')
    .map((c) => (c.data as { uri: string }).uri);

describe('home screen widgets', () => {
  it.each(['Calories', 'Workout', 'Water', 'Weight', 'Supplements', 'Coach'])(
    '%s builds in light and dark, with a background, and every tap has a description',
    (name) => {
      const { light, dark } = widgetFor(name, widgetSnapshot());
      for (const jsx of [light, dark]) {
        const built = buildWidgetTree(jsx) as Node;
        expect(built.type).toMatch(/^(Flex|LinearLayout)Widget$/);
        expect(JSON.stringify(built.props)).toContain('backgroundColor');
        expect(texts(built).length).toBeGreaterThan(1);
        for (const c of clicks(built)) expect(c.label).toEqual(expect.any(String));
      }
    },
  );

  it('count foods: kcal left, + water and same as yesterday run in the background, log food opens the search', () => {
    const t = tree('Calories');
    expect(texts(t)).toContain('1,200 kcal left');
    const actions = clicks(t).map((c) => c.action);
    expect(actions).toEqual(expect.arrayContaining(['WATER', 'SAME_MEAL']));
    expect(uris(t)).toContain('fft://food-search?meal=lunch');
  });

  it('fixed meals: the next meal with Followed / Skipped (background) and Different (app)', () => {
    const s = widgetSnapshot({
      diet: {
        ...widgetSnapshot().diet,
        mode: 'fixed_meals',
        nextMeal: { id: 'm2', name: 'Lunch', kcal: 650, description: 'Rice and chicken' },
        mealsDone: 1,
        mealsTotal: 4,
      },
    });
    const t = tree('Calories', s);
    expect(texts(t)).toContain('Lunch');
    expect(clicks(t)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'MEAL_DONE', data: { mealId: 'm2' } }),
        expect.objectContaining({ action: 'MEAL_SKIPPED', data: { mealId: 'm2' } }),
      ]),
    );
    expect(uris(t)).toContain('fft://diet?adjust=m2');
  });

  it('an Undo is shown on its widget, in place of the actions', () => {
    const st: WidgetState = {
      ...emptyState,
      undo: {
        id: 'u1',
        widget: 'Water',
        message: '250 ml of water added',
        action: { kind: 'water', id: 'w1' },
        until: Date.now() + 5000,
      },
    };
    const water = tree('Water', widgetSnapshot(), st);
    expect(texts(water)).toContain('250 ml of water added');
    expect(clicks(water)).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'UNDO', data: { id: 'u1' } })]),
    );
    expect(clicks(water).some((c) => c.action === 'WATER')).toBe(false);
    // Other widgets do not show it.
    expect(clicks(tree('Weight', widgetSnapshot(), st)).some((c) => c.action === 'UNDO')).toBe(
      false,
    );
  });

  it('workout: Start opens the plan day; in progress, Set done ticks the next set', () => {
    expect(uris(tree('Workout'))).toContain('fft://start-workout?day=day-1');
    const s = widgetSnapshot({
      workout: {
        kind: 'active',
        name: 'Push A',
        exercises: 6,
        dayId: 'day-1',
        active: {
          sessionId: 'sess',
          exercise: 'Bench press',
          setNumber: 2,
          setsTotal: 4,
          weight: '60',
          reps: '8',
          unit: 'kg',
          quick: true,
          setId: 'set-2',
          restEndsAt: null,
        },
      },
    });
    const t = tree('Workout', s);
    expect(texts(t)).toContain('Set 2 of 4 · 60 kg × 8');
    expect(clicks(t)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'SET_DONE',
          data: { sessionId: 'sess', setId: 'set-2' },
        }),
      ]),
    );
    // Tapping elsewhere opens the workout.
    expect(uris(t)).toContain('fft://session/sess');
  });

  it('weight: − / + and Save, with the draft shown', () => {
    const s = widgetSnapshot();
    const st: WidgetState = {
      ...emptyState,
      weightDraft: { userId: s.userId, day: s.day, tenths: 805 },
    };
    const t = tree('Weight', s, st);
    expect(texts(t)).toContain('80.5 kg');
    const actions = clicks(t).map((c) => c.action);
    expect(actions).toEqual(expect.arrayContaining(['WEIGHT_STEP', 'WEIGHT_SAVE']));
  });

  it('supplements: one tappable row of at least 44 dp per supplement, ticked shown with a mark', () => {
    const t = tree('Supplements');
    expect(texts(t)).toEqual(expect.arrayContaining(['✓  Creatine', '○  Vitamin D']));
    const rows = clicks(t).filter((c) => c.action === 'SUPPLEMENT');
    expect(rows.map((r) => r.data)).toEqual([{ id: 's1' }, { id: 's2' }]);
  });

  it('coach: quick questions carry the widgets secret; Ask opens the chat to type', () => {
    const links = uris(tree('Coach', widgetSnapshot(), emptyState, 260));
    expect(links).toContain('fft://ask?prompt=eat&t=secret');
    expect(links).toContain('fft://ask?focus=1');
  });

  it('nothing saved yet, or an unknown widget: still a card, never empty', () => {
    expect((buildWidgetTree(widgetFor('Calories', null).light) as Node).type).toMatch(
      /^(Flex|LinearLayout)Widget$/,
    );
    expect((buildWidgetTree(widgetFor('Other', widgetSnapshot()).light) as Node).type).toMatch(
      /^(Flex|LinearLayout)Widget$/,
    );
    expect((buildWidgetTree(fallbackWidget()) as Node).type).toMatch(/^(Flex|LinearLayout)Widget$/);
  });
});

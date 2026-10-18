import { act, fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useAppearanceStore } from '@/design/appearance-store';
import { renderUI } from '@/test/render';
import { Card } from './Card';
import { IconButton } from './IconButton';
import { ListRow } from './ListRow';
import { MenuList } from './MenuList';
import { pressFeedback } from './motion';
import { OptionCard } from './OptionCard';

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const opacityOf = (name: string) =>
  flat(screen.getByRole(/button|radio/, { name }).props.style).opacity;

describe('press feedback (DECISIONS 109)', () => {
  afterEach(async () => {
    await act(async () => useAppearanceStore.setState({ reduceMotion: false }));
  });

  const cases: [string, () => React.ReactElement][] = [
    [
      'card',
      () => (
        <Card onPress={jest.fn()} accessibilityLabel="card">
          <Text>x</Text>
        </Card>
      ),
    ],
    ['row', () => <ListRow title="row" accessibilityLabel="row" onPress={jest.fn()} />],
    ['menu', () => <MenuList items={[{ icon: 'user', label: 'menu', onPress: jest.fn() }]} />],
    ['option', () => <OptionCard title="option" selected={false} onPress={jest.fn()} />],
    ['icon', () => <IconButton icon="bell" accessibilityLabel="icon" onPress={jest.fn()} />],
  ];

  it.each(cases)(
    '%s dims to the shared opacity while pressed, then comes back',
    async (name, ui) => {
      await renderUI(ui());
      expect(opacityOf(name)).toBe(1);
      await fireEvent(screen.getByRole(/button|radio/, { name }), 'pressIn');
      expect(opacityOf(name)).toBe(pressFeedback.opacity);
      await fireEvent(screen.getByRole(/button|radio/, { name }), 'pressOut');
      expect(opacityOf(name)).toBe(1);
    },
  );

  it('still dims with reduce motion, and does not scale', async () => {
    await act(async () => useAppearanceStore.setState({ reduceMotion: true }));
    await renderUI(<ListRow title="row" accessibilityLabel="row" onPress={jest.fn()} />);
    await fireEvent(screen.getByRole('button', { name: 'row' }), 'pressIn');
    const style = flat(screen.getByRole('button', { name: 'row' }).props.style);
    expect(style.opacity).toBe(pressFeedback.opacity);
    const scale = (style.transform as { scale: unknown }[] | undefined)?.[0]?.scale;
    expect(Number(scale ?? 1)).toBe(1);
  });
});

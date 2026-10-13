import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { renderUI } from '@/test/render';
import { BottomActionBar } from './BottomActionBar';
import { TabBar, type TabBarItem } from './TabBar';

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const items = (activeKey: string, onPress = jest.fn()): TabBarItem[] =>
  (['today', 'train', 'diet', 'progress', 'profile'] as const).map((key) => ({
    key,
    label: key.toUpperCase(),
    icon: key,
    active: key === activeKey,
    onPress: () => onPress(key),
  }));

describe('TabBar', () => {
  it('shows five tabs and marks the active one as selected', async () => {
    await renderUI(<TabBar items={items('train')} />);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByRole('tab', { name: 'TRAIN' }).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByRole('tab', { name: 'DIET' }).props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('every tab is at least 52px high and navigates on press', async () => {
    const onPress = jest.fn();
    await renderUI(<TabBar items={items('today', onPress)} />);
    for (const tab of screen.getAllByRole('tab')) {
      const st = flat(tab.props.style);
      expect((st.height ?? st.minHeight) as number).toBeGreaterThanOrEqual(52);
    }
    await fireEvent.press(screen.getByRole('tab', { name: 'PROGRESS' }));
    expect(onPress).toHaveBeenCalledWith('progress');
  });
});

describe('BottomActionBar', () => {
  it('is pinned to the bottom, above the safe area', async () => {
    await renderUI(
      <BottomActionBar>
        <Text testID="action">go</Text>
      </BottomActionBar>,
    );
    const bar = screen.getByTestId('action').parent!;
    const style = flat(bar.props.style);
    expect(style.position).toBe('absolute');
    expect(style.bottom).toBe(0);
    expect(style.paddingBottom).toBe(12 + 34); // 12px + bottom inset of the test device
  });
});

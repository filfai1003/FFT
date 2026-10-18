import { act, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { useAppearanceStore } from '@/design/appearance-store';
import { palettes } from '@/design/tokens';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { renderUI } from '@/test/render';
import { Skeleton, SkeletonCard, SkeletonGroup, SkeletonRows } from './Skeleton';

describe('Skeleton', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await act(async () => {
      useAppearanceStore.setState({ reduceMotion: false });
      usePreferencesStore.setState({ theme: 'light' });
    });
  });

  it('is one busy "Loading" element for screen readers, its blocks hidden', async () => {
    await renderUI(
      <SkeletonGroup accessibilityLabel="Loading">
        <SkeletonCard />
        <SkeletonRows count={2} />
      </SkeletonGroup>,
    );
    const group = screen.getByLabelText('Loading');
    expect(group.props.accessibilityState).toEqual({ busy: true });
    expect(
      screen.getAllByTestId('skeleton', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(4);
  });

  it('pulses, but stays still with reduce motion', async () => {
    const loop = jest.spyOn(Animated, 'loop');
    await renderUI(
      <SkeletonGroup accessibilityLabel="Loading">
        <Skeleton />
      </SkeletonGroup>,
    );
    expect(loop).toHaveBeenCalledTimes(1);

    loop.mockClear();
    await act(async () => useAppearanceStore.setState({ reduceMotion: true }));
    await renderUI(
      <SkeletonGroup accessibilityLabel="Still">
        <Skeleton />
      </SkeletonGroup>,
    );
    expect(loop).not.toHaveBeenCalled();
  });

  it('uses the track grey of the current theme (light and dark)', async () => {
    await renderUI(<Skeleton />);
    const block = () => screen.getByTestId('skeleton', { includeHiddenElements: true });
    const bg = () =>
      Object.assign({}, ...[block().props.style].flat(Infinity).filter(Boolean)).backgroundColor;
    expect(bg()).toBe(palettes.light.dotOff);
    await act(async () => usePreferencesStore.setState({ theme: 'dark' }));
    expect(bg()).toBe(palettes.dark.dotOff);
  });
});

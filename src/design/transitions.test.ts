import { act, renderHook } from '@testing-library/react-native';
import { useAppearanceStore } from './appearance-store';
import { useOsReduceMotion } from './os-motion';
import { stackTransition, tabDuration, useStackOptions } from './transitions';

describe('page transitions', () => {
  afterEach(() => {
    useAppearanceStore.getState().reset();
    useOsReduceMotion.setState({ value: false });
  });

  it('slides pages, raises modals and fades context switches', () => {
    expect(stackTransition('push', false).animation).toBe('slide_from_right');
    expect(stackTransition('modal', false).animation).toBe('slide_from_bottom');
    expect(stackTransition('fade', false).animation).toBe('fade');
    expect(tabDuration(false)).toBeGreaterThan(0);
  });

  it('with reduce motion nothing moves: a short fade, tabs jump', () => {
    for (const kind of ['push', 'modal', 'fade'] as const)
      expect(stackTransition(kind, true).animation).toBe('fade');
    expect(tabDuration(true)).toBe(0);
  });

  it('follows the app setting and the phone setting', async () => {
    const { result, unmount } = await renderHook(() => useStackOptions('push'));
    expect(result.current.animation).toBe('slide_from_right');
    await act(() => useAppearanceStore.getState().set('reduceMotion', true));
    expect(result.current.animation).toBe('fade');
    await act(() => useAppearanceStore.getState().set('reduceMotion', false));
    expect(result.current.animation).toBe('slide_from_right');
    await act(() => useOsReduceMotion.setState({ value: true }));
    expect(result.current.animation).toBe('fade');
    await unmount();
  });
});

import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAppearanceStore } from '@/design/appearance-store';
import { confirm } from '@/lib/haptics';
import { renderUI } from '@/test/render';
import { CHECK_FILL_MS, CheckFill } from './CheckFill';

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
  ImpactFeedbackStyle: { Light: 'light' },
}));

function Harness() {
  const [done, setDone] = useState(false);
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel="tick" onPress={() => setDone(true)}>
      <CheckFill done={done} size={44} fill="#1F9D63" iconOn="#FFF" iconOff="#666" />
    </Pressable>
  );
}
const opacity = () =>
  StyleSheet.flatten(screen.getByTestId('check-fill', { includeHiddenElements: true }).props.style)
    .opacity as number;

describe('CheckFill (completion animation)', () => {
  afterEach(async () => {
    await act(async () => useAppearanceStore.setState({ reduceMotion: false, haptics: true }));
  });

  it('fills over a short time when ticked', async () => {
    await act(async () => useAppearanceStore.setState({ reduceMotion: false }));
    const timing = jest.spyOn(Animated, 'timing');
    await renderUI(<Harness />);
    expect(opacity()).toBe(0);
    await fireEvent.press(screen.getByLabelText('tick'));
    // Not filled at once: it runs as a short animation to full.
    expect(opacity()).toBeLessThan(1);
    expect(timing).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 1, duration: CHECK_FILL_MS }),
    );
    timing.mockRestore();
  });

  it('with reduce motion it is filled at once', async () => {
    await act(async () => useAppearanceStore.setState({ reduceMotion: true }));
    await renderUI(<Harness />);
    await fireEvent.press(screen.getByLabelText('tick'));
    expect(opacity()).toBe(1);
  });

  it('the haptic tick that goes with it follows the Haptics setting', async () => {
    await act(async () => useAppearanceStore.setState({ haptics: false }));
    confirm();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    await act(async () => useAppearanceStore.setState({ haptics: true }));
    confirm();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });
});

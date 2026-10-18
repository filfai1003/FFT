import '@/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { create } from 'zustand';
import { AiDock } from '@/features/ai/AiDock';
import { renderUI } from '@/test/render';
import { dockHiddenAfterScroll, DOCK_TOP_ZONE } from './dock-scroll';
import { useHintsStore } from './hints-store';
import { weekDotShape } from './week-dots';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const useDockTest = create<{ hidden: boolean }>(() => ({ hidden: false }));
function Harness() {
  return <AiDock hidden={useDockTest((s) => s.hidden)} />;
}

describe('Home coach bar while scrolling', () => {
  it('hides while scrolling down, comes back on the way up and near the top', () => {
    expect(dockHiddenAfterScroll(100, 140, false)).toBe(true);
    expect(dockHiddenAfterScroll(140, 120, true)).toBe(false);
    // Small moves (jitter) change nothing.
    expect(dockHiddenAfterScroll(140, 143, true)).toBe(true);
    expect(dockHiddenAfterScroll(140, 137, false)).toBe(false);
    // Near the top it always shows.
    expect(dockHiddenAfterScroll(0, DOCK_TOP_ZONE, false)).toBe(false);
  });

  const dock = () => screen.getByTestId('ai-dock', { includeHiddenElements: true });
  const hide = (hidden: boolean) => act(() => useDockTest.setState({ hidden }));

  it('when hidden it is out of reach of touch and screen readers, then comes back', async () => {
    useDockTest.setState({ hidden: true });
    await renderUI(<Harness />);
    expect(dock().props.pointerEvents).toBe('none');
    expect(dock().props['aria-hidden']).toBe(true);
    await hide(false);
    expect(dock().props.pointerEvents).toBe('box-none');
    expect(dock().props['aria-hidden']).toBe(false);
  });

  it('never steps aside while something is typed in it', async () => {
    useDockTest.setState({ hidden: false });
    await renderUI(<Harness />);
    await fireEvent.changeText(screen.getByLabelText('Message'), 'Hi');
    await hide(true);
    expect(dock().props.pointerEvents).toBe('box-none');
  });
});

describe('week strip marks (shape, not colour alone)', () => {
  it('filled = on target, ring = off target (past days), today is not judged yet', () => {
    expect(weekDotShape('onTarget', false)).toBe('full');
    expect(weekDotShape('off', false)).toBe('ring');
    expect(weekDotShape('none', false)).toBe('none');
    expect(weekDotShape('off', true)).toBe('today');
    expect(weekDotShape('onTarget', true)).toBe('full');
  });
});

describe('one-time hints', () => {
  it('are remembered once dismissed', async () => {
    await act(async () => {
      await useHintsStore.persist.rehydrate();
    });
    expect(useHintsStore.getState().hydrated).toBe(true);
    expect(useHintsStore.getState().seen.todayTips).toBeUndefined();
    useHintsStore.getState().dismiss('todayTips');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const saved = JSON.parse((await AsyncStorage.getItem('fft.hints.v1')) ?? '{}');
    expect(saved.state.seen).toEqual({ todayTips: true });
    await AsyncStorage.clear();
  });
});

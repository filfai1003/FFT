import '@/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useHintsStore } from '@/features/today/hints-store';
import { renderUI } from '@/test/render';
import { FirstUseHint } from './FirstUseHint';

describe('first-use hints (DECISIONS 124)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await act(async () => useHintsStore.setState({ seen: {}, hydrated: true }));
  });

  it('shows three bullets on the first visit, and never again after "Got it"', async () => {
    const { unmount } = await renderUI(<FirstUseHint id="trainTips" />);
    expect(screen.getByText('How Train works')).toBeTruthy();
    expect(screen.getByText(/Up next is the day to do now/)).toBeTruthy();
    expect(screen.getByText(/exercise library/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Got it'));
    expect(screen.queryByText('How Train works')).toBeNull();
    expect(useHintsStore.getState().seen.trainTips).toBe(true);
    await unmount();

    await renderUI(<FirstUseHint id="trainTips" />);
    expect(screen.queryByText('How Train works')).toBeNull();
  });

  it('each page has its own hint: dismissing one keeps the others', async () => {
    await act(async () => useHintsStore.getState().dismiss('workoutTips'));
    await renderUI(<FirstUseHint id="dietTips" />);
    expect(screen.getByText('How Diet works')).toBeTruthy();
  });

  it('shows nothing before the saved state is read (no flash of a seen hint)', async () => {
    await act(async () => useHintsStore.setState({ hydrated: false }));
    await renderUI(<FirstUseHint id="progressTips" />);
    expect(screen.queryByText('How Progress works')).toBeNull();
  });
});

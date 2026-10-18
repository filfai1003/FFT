import '@/i18n';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import { renderUI } from '@/test/render';
import { AppLockGate, lockDue } from './AppLock';
import { usePrivacyStore } from './privacy-store';

const mockUnlock = jest.fn();
jest.mock('@/lib/biometrics', () => ({
  unlockApp: (...a: unknown[]) => mockUnlock(...a),
}));

let appStateListener: ((s: string) => void) | null = null;

const app = (
  <AppLockGate>
    <Text>{'secret content'}</Text>
  </AppLockGate>
);

describe('app lock (DECISIONS 95)', () => {
  beforeEach(() => {
    mockUnlock.mockReset();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
      appStateListener = fn as (s: string) => void;
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  it('locks again only after the chosen time away', () => {
    expect(lockDue(null, 10_000_000, 1)).toBe(false);
    expect(lockDue(10_000_000 - 59_000, 10_000_000, 1)).toBe(false);
    expect(lockDue(10_000_000 - 60_000, 10_000_000, 1)).toBe(true);
    expect(lockDue(10_000_000 - 4 * 60_000, 10_000_000, 5)).toBe(false);
  });

  it('off: the app shows at once and never asks', async () => {
    usePrivacyStore.setState({ appLock: false });
    await renderUI(app);
    expect(screen.getByText('secret content')).toBeTruthy();
    expect(screen.queryByText('FFT is locked')).toBeNull();
    expect(mockUnlock).not.toHaveBeenCalled();
  });

  it('on: asks at start, a cancel leaves an Unlock button, passing shows the app', async () => {
    usePrivacyStore.setState({ appLock: true, lockAfterMin: 1 });
    mockUnlock.mockResolvedValueOnce('failed').mockResolvedValueOnce('passed');
    jest.useFakeTimers();
    await renderUI(app);
    expect(screen.getByRole('header', { name: 'FFT is locked' })).toBeTruthy();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    expect(mockUnlock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('header', { name: 'FFT is locked' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock' }));
    expect(mockUnlock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('FFT is locked')).toBeNull();
    expect(screen.getByText('secret content')).toBeTruthy();

    // Back after two minutes in the background: locked again.
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    await act(async () => appStateListener?.('background'));
    spy.mockReturnValue(now + 2 * 60_000);
    mockUnlock.mockResolvedValueOnce('failed');
    await act(async () => appStateListener?.('active'));
    spy.mockRestore();
    expect(screen.getByRole('header', { name: 'FFT is locked' })).toBeTruthy();
    // Let the prompt it opens finish.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  });
});

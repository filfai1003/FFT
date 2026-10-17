import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useSync } from './use-sync';

const mockDb = { tracking: false, onChange: () => () => undefined };
jest.mock('@/lib/local-db', () => ({ getLocalDb: () => mockDb }));
const mockSyncOnce = jest.fn(async () => false);
jest.mock('./sync', () => ({ syncOnce: () => mockSyncOnce() }));
jest.mock('@/lib/error-report', () => ({ reportError: jest.fn() }));

const U = '11111111-2222-4333-8444-555555555555';
const queryClient = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  mockDb.tracking = false;
  mockSyncOnce.mockClear();
});

describe('useSync', () => {
  it('runs for an account that keeps a copy on the server', async () => {
    const hook = await renderHook(() => useSync(U, true), { wrapper });
    await waitFor(() => expect(mockSyncOnce).toHaveBeenCalled());
    expect(mockDb.tracking).toBe(true);
    await hook.unmount();
  });

  it('never runs without the copy on the server (off or not chosen yet)', async () => {
    const hook = await renderHook(() => useSync(U, false), { wrapper });
    expect(mockSyncOnce).not.toHaveBeenCalled();
    expect(mockDb.tracking).toBe(false);
    await hook.unmount();
  });

  it('consent withdrawn: nothing is sent, changes are still noted for later', async () => {
    const hook = await renderHook(
      ({ paused }: { paused: boolean }) => useSync(U, true, { paused }),
      { wrapper, initialProps: { paused: true } },
    );
    expect(mockSyncOnce).not.toHaveBeenCalled();
    expect(mockDb.tracking).toBe(true);
    // Consent given again: the sync goes on.
    await hook.rerender({ paused: false });
    await waitFor(() => expect(mockSyncOnce).toHaveBeenCalled());
    await hook.unmount();
  });
});

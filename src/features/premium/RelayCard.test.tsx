import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import '@/i18n';
import { useSessionStore } from '@/features/auth/session-store';
import { usePlanStore } from '@/lib/plan';
import { renderUI } from '@/test/render';
import { RelayCard } from './RelayCard';

const U = '11111111-2222-4333-8444-555555555555';
const mockStart = jest.fn(async (..._a: unknown[]) => ({
  text: 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789',
  qr: 'FFTRELAY1:ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789',
}));
jest.mock('./relay', () => {
  const { create } = jest.requireActual('zustand');
  return {
    useRelayStore: create(() => ({ paired: {} })),
    startRelay: (...a: unknown[]) => mockStart(...a),
    loadRelay: async () => null,
    relayDevices: async () => [],
    joinRelay: jest.fn(),
    leaveRelay: jest.fn(),
    removeRelayDevice: jest.fn(),
    relayOnce: jest.fn(),
    InvalidCodeError: class extends Error {},
  };
});
jest.mock('./sync', () => ({ setSharedCategories: jest.fn() }));
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));

const withQuery = (ui: React.ReactElement) =>
  renderUI(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  useSessionStore.setState({ status: 'signedIn', session: null, userId: U });
});

describe('sync with another phone', () => {
  it('with a copy on the server: explains that the two exclude each other', async () => {
    usePlanStore.setState({ userId: U, sync: 'on' });
    await withQuery(<RelayCard />);
    expect(screen.getByText(/the two cannot be on together/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show a pairing code' })).toBeNull();
  });

  it('without: shows the code as a QR code and as text, with a warning', async () => {
    usePlanStore.setState({ userId: U, sync: 'off' });
    await withQuery(<RelayCard />);
    expect(screen.getByText(/end-to-end encrypted/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Scan a code' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Show a pairing code' }));
    await waitFor(() =>
      expect(screen.getByText('ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789')).toBeTruthy(),
    );
    expect(screen.getByLabelText(/^Pairing code, ABCD/)).toBeTruthy();
    expect(screen.getByText(/show it only to your own phones/)).toBeTruthy();
    expect(mockStart).toHaveBeenCalledWith(U);
  });
});

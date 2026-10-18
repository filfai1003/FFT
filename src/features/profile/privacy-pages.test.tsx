import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { useSessionStore } from '@/features/auth/session-store';
import { DataSyncScreen } from './DataSyncScreen';
import { PrivacyScreen } from './PrivacyScreen';

const mockSetConsent = jest.fn(async () => undefined);
jest.mock('./account', () => ({
  ...jest.requireActual('./account'),
  useConsents: () => ({
    data: [
      { id: '1', type: 'health_data', grantedAt: '2026-10-01T10:00:00Z', withdrawnAt: null },
      { id: '2', type: 'ai_coach', grantedAt: '2026-10-02T10:00:00Z', withdrawnAt: null },
    ],
  }),
  useSetConsent: () => ({ mutateAsync: mockSetConsent, mutate: jest.fn(), isPending: false }),
  deleteAccount: jest.fn(),
  deleteAccountKeepData: jest.fn(),
}));
jest.mock('./export', () => ({
  deliverFile: jest.fn(),
  exportFileNames: { full: () => 'x.zip', workouts: () => 'x.csv' },
  fullExportZip: jest.fn(),
  workoutsCsv: jest.fn(),
}));
jest.mock('./import', () => ({ importExport: jest.fn(), pickExportFile: jest.fn() }));
jest.mock('@/lib/legal', () => ({ openLegal: jest.fn() }));
jest.mock('@/lib/biometrics', () => ({
  authenticate: jest.fn(),
  canAuthenticate: jest.fn(),
  unlockApp: jest.fn(),
}));
jest.mock('@/lib/mode', () => ({ getMode: () => 'cloud' }));
jest.mock('@/features/premium/ServerCopy', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return { ServerCopyCard: () => <RNText>{'stub-server-copy'}</RNText> };
});
jest.mock('@/features/premium/RelayCard', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return { RelayCard: () => <RNText>{'stub-relay'}</RNText> };
});
jest.mock('@/features/premium/SyncCard', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return { SyncCard: () => <RNText>{'stub-sync-check'}</RNText> };
});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const routes = {
  _layout: () => (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </QueryClientProvider>
  ),
  index: () => <Text>{'page-home'}</Text>,
  'profile/_layout': () => <Stack screenOptions={{ headerShown: false, animation: 'none' }} />,
  'profile/index': () => <Text>{'page-profile'}</Text>,
  'profile/privacy': PrivacyScreen,
  'profile/data': DataSyncScreen,
  'profile/ai': () => <Text>{'page-ai'}</Text>,
};

describe('Privacy and Data & sync (DECISIONS 101)', () => {
  beforeAll(() => useSessionStore.setState({ userId: 'u1' }));
  afterAll(() => queryClient.clear());
  beforeEach(() => mockSetConsent.mockClear());

  it('Privacy holds the everyday settings, not the technical ones', async () => {
    await renderRouter(routes, { initialUrl: '/profile/privacy' });
    expect(screen.getByRole('header', { name: 'Privacy' })).toBeTruthy();
    for (const text of [
      'Lock with fingerprint or face',
      'Hide progress photos from screenshots',
      'Hide the whole app from screenshots',
      'What the AI coach can see',
      'Health data consent',
      'AI coach consent',
      'Download everything',
      'Delete account',
      'Technical data settings',
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    for (const text of ['stub-server-copy', 'stub-relay', 'stub-sync-check', 'Import an export']) {
      expect(screen.queryByText(text)).toBeNull();
    }
  });

  it('withdrawing the AI coach consent from Privacy', async () => {
    await renderRouter(routes, { initialUrl: '/profile/privacy' });
    await act(() => fireEvent.press(screen.getByLabelText('Withdraw, AI coach consent')));
    expect(mockSetConsent).toHaveBeenCalledWith({ type: 'ai_coach', granted: false });
  });

  it('"What the AI coach can see" opens the coach settings', async () => {
    await renderRouter(routes, { initialUrl: '/profile/privacy' });
    await act(() => fireEvent.press(screen.getByText('What the AI coach can see')));
    expect(screen.getByText('page-ai')).toBeTruthy();
  });

  it('Technical data settings opens Data & sync, and its Privacy link goes back', async () => {
    await renderRouter(routes, { initialUrl: '/profile/privacy' });
    await act(() => fireEvent.press(screen.getByText('Technical data settings')));
    expect(screen.getByRole('header', { name: 'Data & sync' })).toBeTruthy();
    for (const text of ['stub-server-copy', 'stub-relay', 'stub-sync-check', 'Import an export']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByText('Delete account')).toBeNull();
    await act(() => fireEvent.press(screen.getByText('Privacy')));
    expect(screen.getByRole('header', { name: 'Privacy' })).toBeTruthy();
    // Went back (the two pages do not pile up): Data & sync is gone, not hidden under Privacy.
    expect(screen.queryByText('stub-relay', { includeHiddenElements: true })).toBeNull();
  });

  it('Data & sync opened directly links to Privacy', async () => {
    await renderRouter(routes, { initialUrl: '/profile/data' });
    expect(screen.getByText('On this phone')).toBeTruthy();
    await act(() => fireEvent.press(screen.getByText('Privacy')));
    expect(screen.getByRole('header', { name: 'Privacy' })).toBeTruthy();
    expect(screen.getByText('Technical data settings')).toBeTruthy();
  });
});

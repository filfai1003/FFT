import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { useSessionStore } from '@/features/auth/session-store';
import { PhonePrivacyScreen } from './PhonePrivacyScreen';
import { YourDataScreen } from './YourDataScreen';

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
  // Same as app/profile/privacy.tsx: the old address lands on Your data.
  'profile/privacy': () => <Redirect href="/profile/data" />,
  'profile/data': YourDataScreen,
  'profile/phone-privacy': PhonePrivacyScreen,
  'profile/ai': () => <Text>{'page-ai'}</Text>,
};

/** What only this phone does, and what happens to the data: never on the other page. */
const PHONE_ONLY = [
  'Lock with fingerprint or face',
  'Hide progress photos from screenshots',
  'Hide the whole app from screenshots',
  'Blur photos until tapped',
  'Lock photos',
];
const DATA_ONLY = [
  'Health data consent',
  'AI coach consent',
  'What the AI coach can see',
  'stub-server-copy',
  'stub-relay',
  'stub-sync-check',
  'Download everything',
  'Import an export',
  'Delete account',
];

describe('Your data and Phone privacy, split by effect (DECISIONS 102)', () => {
  beforeAll(() => useSessionStore.setState({ userId: 'u1' }));
  afterAll(() => queryClient.clear());
  beforeEach(() => mockSetConsent.mockClear());

  it('Your data holds everything that moves or processes data, delete account last', async () => {
    await renderRouter(routes, { initialUrl: '/profile/data' });
    expect(screen.getByRole('header', { name: 'Your data' })).toBeTruthy();
    expect(
      screen.getByText(/how your data is used, where it goes and who handles it/),
    ).toBeTruthy();
    for (const text of [...DATA_ONLY, 'Phone privacy']) expect(screen.getByText(text)).toBeTruthy();
    for (const text of PHONE_ONLY) expect(screen.queryByText(text)).toBeNull();
  });

  it('Phone privacy holds only what changes this phone', async () => {
    await renderRouter(routes, { initialUrl: '/profile/phone-privacy' });
    expect(screen.getByRole('header', { name: 'Phone privacy' })).toBeTruthy();
    expect(screen.getByText(/Your data does not move/)).toBeTruthy();
    for (const text of PHONE_ONLY) expect(screen.getByText(text)).toBeTruthy();
    for (const text of DATA_ONLY) expect(screen.queryByText(text)).toBeNull();
  });

  it('the old Privacy address opens Your data (consent, export and delete live there)', async () => {
    await renderRouter(routes, { initialUrl: '/profile/privacy' });
    expect(screen.getByRole('header', { name: 'Your data' })).toBeTruthy();
    expect(screen.getByText('Delete account')).toBeTruthy();
  });

  it('withdrawing the AI coach consent from Your data', async () => {
    await renderRouter(routes, { initialUrl: '/profile/data' });
    await act(() => fireEvent.press(screen.getByLabelText('Withdraw, AI coach consent')));
    expect(mockSetConsent).toHaveBeenCalledWith({ type: 'ai_coach', granted: false });
  });

  it('"What the AI coach can see" opens the coach settings', async () => {
    await renderRouter(routes, { initialUrl: '/profile/data' });
    await act(() => fireEvent.press(screen.getByText('What the AI coach can see')));
    expect(screen.getByText('page-ai')).toBeTruthy();
  });

  it('Your data links to Phone privacy, whose Your data link goes back', async () => {
    await renderRouter(routes, { initialUrl: '/profile/data' });
    await act(() => fireEvent.press(screen.getByText('Phone privacy')));
    expect(screen.getByRole('header', { name: 'Phone privacy' })).toBeTruthy();
    await act(() => fireEvent.press(screen.getByText('Your data')));
    expect(screen.getByRole('header', { name: 'Your data' })).toBeTruthy();
    // Went back (the two pages do not pile up): Phone privacy is gone, not hidden underneath.
    expect(screen.queryByText('Lock photos', { includeHiddenElements: true })).toBeNull();
  });

  it('Phone privacy opened directly links to Your data', async () => {
    await renderRouter(routes, { initialUrl: '/profile/phone-privacy' });
    await act(() => fireEvent.press(screen.getByText('Your data')));
    expect(screen.getByRole('header', { name: 'Your data' })).toBeTruthy();
    expect(screen.getByText('Delete account')).toBeTruthy();
  });
});

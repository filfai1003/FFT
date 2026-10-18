import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { useSessionStore } from '@/features/auth/session-store';
import { createLocalClient } from '@/lib/local-db/client';
import { LocalDb, type Kv } from '@/lib/local-db/engine';
import { LOCAL_USER_ID } from '@/lib/local-db/schema';
import { ProfileScreen } from './ProfileScreen';
import { SettingsHubScreen } from './SettingsHubScreen';

function memoryKv(): Kv {
  const texts = new Map<string, string>();
  return {
    getText: async (k) => texts.get(k) ?? null,
    setText: async (k, v) => void texts.set(k, v),
    putFile: async () => undefined,
    fileUrl: async () => null,
    readFile: async () => null,
    removeFile: async () => undefined,
    clearAll: async () => texts.clear(),
  };
}

const mockClient = createLocalClient(new LocalDb(memoryKv(), LOCAL_USER_ID));
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockClient }));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const page = (name: string) =>
  function Page() {
    return <Text>{`page-${name}`}</Text>;
  };

const routes = {
  _layout: () => (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </QueryClientProvider>
  ),
  index: page('home'),
  'profile/_layout': () => <Stack screenOptions={{ headerShown: false, animation: 'none' }} />,
  'profile/index': ProfileScreen,
  'profile/settings': SettingsHubScreen,
  'profile/units': page('units'),
  'train/history': page('history'),
};

describe('Profile and Settings', () => {
  beforeAll(() => useSessionStore.setState({ userId: LOCAL_USER_ID }));
  afterAll(() => queryClient.clear());

  it('the profile is your own page; the gear opens Settings', async () => {
    await renderRouter(routes, { initialUrl: '/profile' });
    // Your page: numbers, no settings list.
    expect(screen.getByText('This month')).toBeTruthy();
    expect(screen.queryByText('Units')).toBeNull();

    await act(() => fireEvent.press(screen.getByLabelText('Settings')));
    expect(screen).toHavePathname('/profile/settings');
    expect(screen.getByText('Units')).toBeTruthy();
    expect(screen.getByText('Accessibility')).toBeTruthy();
  });

  it('settings rows still open the /profile/... pages', async () => {
    await renderRouter(routes, { initialUrl: '/profile/settings' });
    await act(() => fireEvent.press(screen.getByLabelText(/^Units/)));
    expect(screen).toHavePathname('/profile/units');
    expect(screen.getByText('page-units')).toBeTruthy();
  });
});

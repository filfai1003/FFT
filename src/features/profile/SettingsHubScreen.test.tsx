import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';

import { SettingsHubScreen } from './SettingsHubScreen';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ getState: () => ({ routes: [] }) }),
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({}),
}));
jest.mock('./use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('./api', () => ({ useProfile: () => ({ data: { name: 'Filippo' } }) }));
jest.mock('@/features/diet/log', () => ({ useGoalForDay: () => ({ kcal: 2400 }) }));
jest.mock('@/lib/mode', () => ({ getMode: () => 'cloud' }));
jest.mock('@/lib/app-update', () => ({
  appUpdateInfo: () => ({ enabled: false }),
  checkForAppUpdate: jest.fn(),
  restartApp: jest.fn(),
}));

describe('Settings (the gear on your profile)', () => {
  beforeEach(() => mockPush.mockClear());

  it('groups the settings and opens each page', async () => {
    await renderUI(<SettingsHubScreen />);
    for (const title of ['Account', 'Plans', 'App', 'Data']) {
      expect(screen.getByRole('header', { name: title })).toBeTruthy();
    }
    await fireEvent.press(screen.getByLabelText('Personal info, Filippo'));
    expect(mockPush).toHaveBeenLastCalledWith('/profile-edit');
    await fireEvent.press(screen.getByLabelText(/^Units, look and reminders/));
    expect(mockPush).toHaveBeenLastCalledWith('/profile/preferences');
    await fireEvent.press(screen.getByLabelText(/^Privacy,/));
    expect(mockPush).toHaveBeenLastCalledWith('/profile/privacy');
    await fireEvent.press(screen.getByLabelText(/^Data & sync,/));
    expect(mockPush).toHaveBeenLastCalledWith('/profile/data');
  });

  it('the Data section: Privacy, then Data & sync, each with a help line, then API & MCP', async () => {
    await renderUI(<SettingsHubScreen />);
    expect(
      screen.getByText('App lock, screenshots, consents, export, delete account'),
    ).toBeTruthy();
    expect(screen.getByText('Copy on the server, encryption, syncing your phones')).toBeTruthy();
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string | undefined)
      .filter((l): l is string => !!l && /^(Privacy|Data & sync|API & MCP),/.test(l))
      .map((l) => l.split(',')[0]);
    expect(labels).toEqual(['Privacy', 'Data & sync', 'API & MCP']);
  });

  it('has no Help & feedback row (not built)', async () => {
    await renderUI(<SettingsHubScreen />);
    expect(screen.queryByText('Help & feedback')).toBeNull();
  });

  it('one Plans row (Free, Supporter and Premium) opens the plans page', async () => {
    await renderUI(<SettingsHubScreen />);
    await fireEvent.press(screen.getByLabelText(/^Plans/));
    expect(mockPush).toHaveBeenLastCalledWith('/profile/premium');
    expect(screen.getByText('Free, Supporter and Premium')).toBeTruthy();
  });
});

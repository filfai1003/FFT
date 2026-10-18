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
    await fireEvent.press(screen.getByLabelText(/^Privacy & data/));
    expect(mockPush).toHaveBeenLastCalledWith('/profile/privacy');
  });

  it('Premium is the only plan listed (Supporter is separate and not built)', async () => {
    await renderUI(<SettingsHubScreen />);
    await fireEvent.press(screen.getByLabelText(/^Premium/));
    expect(mockPush).toHaveBeenLastCalledWith('/profile/premium');
    expect(screen.queryByText(/Supporter/)).toBeNull();
  });
});

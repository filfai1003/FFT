import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';

import { ProfileScreen, initialsOf } from './ProfileScreen';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ getState: () => ({ routes: [] }) }),
}));

jest.mock('./use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('./api', () => ({
  useProfile: () => ({
    data: {
      name: 'Filippo Rossi',
      goal: 'build_muscle',
      height_cm: 180,
      created_at: '2026-07-26T10:00:00Z',
      timezone: 'UTC',
    },
  }),
  useLatestWeight: () => ({ data: { weightKg: 81.2, day: '2026-10-18' } }),
}));
jest.mock('./stats', () => ({
  useProfileStats: () => ({ data: { streak: 12, loggedThisMonth: 9, daysSoFar: 18 } }),
}));
jest.mock('@/features/progress/strength', () => ({ useStrength: () => ({ overall: 3.5 }) }));
jest.mock('@/features/diet/log', () => ({
  useGoalForDay: () => ({ kcal: 2600 }),
}));
jest.mock('@/features/train/history', () => ({
  useMonthSessions: () => ({
    data: [
      { startedAt: '2026-10-17T18:00:00Z' },
      { startedAt: '2026-10-15T18:00:00Z' },
      { startedAt: '2026-09-30T18:00:00Z' },
    ],
  }),
}));

describe('Profile (your own page)', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows who you are and your numbers', async () => {
    await renderUI(<ProfileScreen />);
    expect(screen.getByText('Filippo Rossi')).toBeTruthy();
    expect(screen.getByText('FR', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Build muscle · Member since July 2026')).toBeTruthy();
    // Streak, workouts this month (September's session left out), strength.
    expect(screen.getByLabelText('12 Day streak')).toBeTruthy();
    expect(screen.getByLabelText('2 Workouts in October')).toBeTruthy();
    expect(screen.getByLabelText('+3.5% Strength, 4 wk')).toBeTruthy();
    expect(screen.getByLabelText('9 of 18 days this month with something logged')).toBeTruthy();
    expect(screen.getByText('Only you see: 81.2 kg · 180 cm · 2,600 kcal')).toBeTruthy();
  });

  it('the gear opens Settings, the rows open their pages', async () => {
    await renderUI(<ProfileScreen />);
    await fireEvent.press(screen.getByLabelText('Settings'));
    expect(mockPush).toHaveBeenLastCalledWith('/profile/settings');
    await fireEvent.press(screen.getByLabelText('Progress'));
    expect(mockPush).toHaveBeenLastCalledWith('/progress');
    await fireEvent.press(screen.getByLabelText('Goals and diet mode, 2,600 kcal'));
    expect(mockPush).toHaveBeenLastCalledWith('/diet-goals');
  });

  it('initials', () => {
    expect(initialsOf('Filippo Rossi')).toBe('FR');
    expect(initialsOf('  ')).toBe('');
    expect(initialsOf(null)).toBe('');
  });
});

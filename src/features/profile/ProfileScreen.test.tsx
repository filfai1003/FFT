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
jest.mock('@/features/community/ProfileCommunityCard', () => ({
  ProfileCommunityCard: () => null,
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

jest.mock('@/features/train/exercises', () => ({
  useExercises: () => ({ data: [{ id: 'bench', name: 'Bench press' }] }),
}));
jest.mock('@/features/gamification/data', () => {
  const { computeGamification } = jest.requireActual('@/domain/gamification');
  const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
  const workouts = Array.from({ length: 10 }, (_, i) => ({
    id: `w${i}`,
    day: day(i + 1),
    hour: 18,
  }));
  const activity = {
    loggedDays: new Set(Array.from({ length: 12 }, (_, i) => day(i + 7))),
    workouts,
    dietOnTargetDays: new Set(),
    checkInDays: new Set(),
    exerciseDays: [
      { exerciseId: 'bench', day: day(2), bestWeightKg: 80, bestE1rmKg: 90 },
      { exerciseId: 'bench', day: day(9), bestWeightKg: 85, bestE1rmKg: 92 },
    ],
  };
  const game = { ...computeGamification({ ...activity, today: '2026-10-18' }), activity };
  return { useGamification: () => game };
});

describe('Profile (your own page)', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows who you are and your numbers', async () => {
    await renderUI(<ProfileScreen />);
    expect(screen.getByText('Filippo Rossi')).toBeTruthy();
    expect(screen.getByText('FR', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText(/^Build muscle · [0-9,]+ XP to level [0-9]+$/)).toBeTruthy();
    // Streak, badges, strength; the level ring, records and badges (canvas Profile).
    expect(screen.getByLabelText('12 Day streak')).toBeTruthy();
    expect(screen.getByLabelText('5 Badges')).toBeTruthy();
    expect(
      screen.getByLabelText(/^Level [0-9]+, [0-9]+% of the way to level [0-9]+$/),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Bench press: new record 85 kg, up 5 kg, 6.3 percent, 9 Oct'),
    ).toBeTruthy();
    expect(screen.getByLabelText('10 workouts: earned 10 Oct')).toBeTruthy();
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

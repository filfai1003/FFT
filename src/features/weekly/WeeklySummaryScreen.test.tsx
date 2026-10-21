import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { ThisWeekCard } from './ThisWeekCard';
import { WeeklySummaryScreen } from './WeeklySummaryScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-21' }));
jest.mock('@/features/profile/api', () => ({
  useProfile: () => ({ data: { goal: 'lose_fat', timezone: 'UTC' } }),
}));
jest.mock('@/features/progress/data', () => ({
  useBodyGoal: () => ({ data: { targetWeightKg: 75 } }),
}));
jest.mock('@/features/train/exercises', () => ({
  useExercises: () => ({ data: [{ id: 'bench', name: 'Bench press' }] }),
}));
jest.mock('@/features/progress/balance', () => ({
  useBalance: () => ({
    isPending: false,
    rows: [],
    behind: { muscle: 'back', movement: 'pull', sets: 4, volumeKg: 0, status: 'under' },
    within: 0,
    empty: false,
  }),
}));

const mockState = { dietTracked: true, empty: false };
jest.mock('./data', () => ({
  useWeeklySummary: (day?: string) => {
    const days = (list: string[]) => new Set(mockState.empty ? [] : list);
    const { buildWeeklySummary } =
      jest.requireActual<typeof import('@/domain/weekly-summary')>('@/domain/weekly-summary');
    return {
      dietTracked: mockState.dietTracked,
      summary: buildWeeklySummary({
        day: day ?? '2026-10-21',
        today: '2026-10-21',
        weekStart: 'mon',
        planDays: 4,
        activity: {
          loggedDays: days(['2026-10-19', '2026-10-20', '2026-10-21']),
          workouts: mockState.empty
            ? []
            : [
                { id: 'a', day: '2026-10-19', hour: 18 },
                { id: 'b', day: '2026-10-21', hour: 18 },
              ],
          dietOnTargetDays: days(['2026-10-19', '2026-10-20']),
          checkInDays: new Set(),
          exerciseDays: mockState.empty
            ? []
            : [
                { exerciseId: 'bench', day: '2026-10-12', bestWeightKg: 80, bestE1rmKg: 90 },
                { exerciseId: 'bench', day: '2026-10-19', bestWeightKg: 85, bestE1rmKg: 92 },
              ],
        },
        weights: mockState.empty
          ? []
          : [
              { day: '2026-10-18', kg: 80.6 },
              { day: '2026-10-21', kg: 80.2 },
            ],
      }),
    };
  },
}));

describe('Weekly summary (DECISIONS 122)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockState.dietTracked = true;
    mockState.empty = false;
  });

  it('shows the week: workouts vs plan, diet days, weight toward the goal, streak, badges, record', async () => {
    await renderUI(<WeeklySummaryScreen />);
    expect(screen.getByText('Your week')).toBeTruthy();
    expect(screen.getByText('19 Oct – 25 Oct')).toBeTruthy();
    expect(screen.getByLabelText('Workouts: 2 of 4 planned')).toBeTruthy();
    expect(screen.getByLabelText('Days on target: 2 of 3')).toBeTruthy();
    expect(screen.getByText('−0.4 kg')).toBeTruthy();
    expect(screen.getByText('Bench press')).toBeTruthy();
    expect(screen.getByText('Badges earned')).toBeTruthy();
    expect(screen.getByText('Closest badges')).toBeTruthy();
    // The training balance's most behind group.
    expect(screen.getByText(/Back/)).toBeTruthy();
  });

  it('earlier weeks with the arrows; no later week than this one', async () => {
    await renderUI(<WeeklySummaryScreen />);
    fireEvent.press(screen.getByLabelText('Previous week'));
    expect(await screen.findByText('12 Oct – 18 Oct')).toBeTruthy();
    expect(screen.getByText('That week')).toBeTruthy();
  });

  it('an empty week and no calorie target', async () => {
    mockState.empty = true;
    mockState.dietTracked = false;
    await renderUI(<WeeklySummaryScreen />);
    expect(screen.getByText('No calorie target set')).toBeTruthy();
    expect(screen.getByText('No weight logged')).toBeTruthy();
    expect(screen.getByText('No new badge this week.')).toBeTruthy();
  });

  it('Progress card: the week in one line, opens the summary', async () => {
    await renderUI(<ThisWeekCard />);
    expect(screen.getByText('2 workouts · 2 days on target · −0.4 kg')).toBeTruthy();
    fireEvent.press(
      screen.getByLabelText(
        'This week: 2 workouts · 2 days on target · −0.4 kg. Opens your weekly summary',
      ),
    );
    expect(mockPush).toHaveBeenCalledWith('/progress/week?from=2026-10-19');
  });
});

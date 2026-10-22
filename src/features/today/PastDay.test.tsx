import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { renderUI } from '@/test/render';
import { HomeDayContext, useHomeDay } from './home-day';
import { TodayScreen } from './TodayScreen';
import { WeightWidget, WorkoutWidget } from './Widgets';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: () => undefined,
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@/components/ui/TabBar', () => ({ useTabBarHeight: () => 80 }));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('@/features/profile/api', () => ({
  useProfile: () => ({ data: { name: 'Filippo Rossi', goal: 'lose_fat', timezone: 'UTC' } }),
}));
jest.mock('@/features/community/api', () => ({ useCommunityMe: () => ({ data: null }) }));
jest.mock('@/features/diet/week-status', () => ({
  useStripStatuses: () => ({ '2026-10-14': 'onTarget' }),
}));
jest.mock('@/features/progress/calendar-data', () => ({ DayCalendarSheet: () => null }));
jest.mock('@/features/ai/AiDock', () => ({ AI_DOCK_CLEARANCE: 100, AiDock: () => null }));
jest.mock('@/features/session/ActiveSessionBanner', () => ({ ActiveSessionBanner: () => null }));
jest.mock('@/features/supplements/migrate-creatine', () => ({
  migrateCreatineDays: () => Promise.resolve(false),
}));
jest.mock('./DayOverview', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    Greeting: () => <RNText accessibilityRole="header">Good evening, Filippo</RNText>,
    DaySummaryLine: () => <RNText>summary-line</RNText>,
  };
});
// The cards themselves are tested below: here a probe says which day they are given.
function MockProbe() {
  const { day, past } = useHomeDay();
  return <Text>{`cards-show-${day}${past ? '-past' : ''}`}</Text>;
}
jest.mock('./TodayGrid', () => ({
  TodayGrid: () => <MockProbe />,
}));

// Cards on a past day.
let mockDone: { name: string; stats: { sets: number } }[] = [];
const mockWorkoutDay = jest.fn();
jest.mock('./day-status', () => ({
  useTodayWorkout: (day?: string) => {
    mockWorkoutDay(day);
    return {
      plan: { id: 'p1', days: [] },
      rotation: { state: { cycle: 1, doneCount: 1, totalDays: 3 } },
      upNext: { id: 'd1', name: 'Push A', exercises: [] },
      doneToday: mockDone,
    };
  },
}));
jest.mock('@/features/train/plans', () => ({
  estimateMinutes: () => 40,
  useActivePlan: () => ({ plan: null }),
  useRotation: () => null,
}));
jest.mock('@/features/train/mark-done', () => ({
  useMarkWorkoutDone: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetWorkoutDeleted: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/train/NewPlanSheet', () => ({ NewPlanSheet: () => null }));
jest.mock('@/features/session/start', () => ({ useStartWorkout: () => ({ startDay: jest.fn() }) }));
jest.mock('@/features/ai/use-coach-ready', () => ({
  useCoachReady: () => false,
  useAskCoach: () => jest.fn(),
}));
let mockBody: { day: string; weightKg: number | null }[] = [];
jest.mock('@/features/progress/data', () => ({
  useBodyEntries: () => ({ data: mockBody }),
  useBodyGoal: () => ({ data: null }),
}));

beforeEach(() => {
  mockPush.mockClear();
  mockWorkoutDay.mockClear();
  mockDone = [];
  mockBody = [];
});

describe('Today on a past day (DECISIONS 123)', () => {
  it('a tap on a day of the row shows that day on Today, with Back to today', async () => {
    await renderUI(<TodayScreen />);
    expect(screen.getByText('cards-show-2026-10-18')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Good evening, Filippo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to today' })).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'Wednesday 14, on target' }));
    // Not the calendar page: the page itself now shows that day.
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText('cards-show-2026-10-14-past')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Wednesday 14 October' })).toBeTruthy();
    expect(screen.getByText('Looking back')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Wednesday 14, on target' })).toBeChecked();
    // Today's summary line is about today: not shown over a past day.
    expect(screen.queryByText('summary-line')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Back to today' }));
    expect(screen.getByText('cards-show-2026-10-18')).toBeTruthy();
  });

  it('the calendar opens from the header button, not from the row of days', async () => {
    await renderUI(<TodayScreen />);
    expect(screen.getByRole('button', { name: 'Open the calendar' })).toBeTruthy();
  });

  it('workout card: what was done that day, never Start; else mark one as done', async () => {
    await renderUI(
      <HomeDayContext.Provider value="2026-10-14">
        <WorkoutWidget size="large" />
      </HomeDayContext.Provider>,
    );
    expect(mockWorkoutDay).toHaveBeenCalledWith('2026-10-14');
    expect(screen.getByText('No workout this day')).toBeTruthy();
    expect(screen.queryByText('Start')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark a workout as done' })).toBeTruthy();

    mockDone = [{ name: 'Pull A', stats: { sets: 15 } }];
    await renderUI(
      <HomeDayContext.Provider value="2026-10-14">
        <WorkoutWidget size="large" />
      </HomeDayContext.Provider>,
    );
    expect(screen.getByText('Workout done')).toBeTruthy();
    expect(screen.getByText('Pull A · 15 sets')).toBeTruthy();
    expect(screen.queryByText('Train again')).toBeNull();
  });

  it('weight card: the weight as it was that day, read-only when none was logged by then', async () => {
    mockBody = [
      { day: '2026-10-17', weightKg: 80.1 },
      { day: '2026-10-12', weightKg: 81.4 },
    ];
    await renderUI(
      <HomeDayContext.Provider value="2026-10-14">
        <WeightWidget size="large" />
      </HomeDayContext.Provider>,
    );
    expect(screen.getByText('81.4')).toBeTruthy();
    expect(screen.queryByText('80.1')).toBeNull();

    mockBody = [{ day: '2026-10-17', weightKg: 80.1 }];
    await renderUI(
      <HomeDayContext.Provider value="2026-10-14">
        <WeightWidget size="large" />
      </HomeDayContext.Provider>,
    );
    expect(screen.getByText('No weight logged by then')).toBeTruthy();
    expect(screen.queryByText('Log your weight')).toBeNull();
  });
});

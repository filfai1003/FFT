import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { color } from '@/design/tokens';
import { renderUI as renderBare } from '@/test/render';
import { ExerciseDetailScreen } from './ExerciseDetailScreen';
import { HistoryScreen } from './HistoryScreen';
import type { PlanDayView, PlanView, Rotation } from './plans';
import { TrainScreen } from './TrainScreen';

// Exercise images ask the query client for signed URLs (own photos only): give them one.
const renderUI = (ui: ReactElement) =>
  renderBare(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockNavigate,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useNavigation: () => ({ getState: () => ({ routes: [] }) }),
}));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: { timezone: 'UTC' } }) }));
jest.mock('@/features/gamification/data', () => ({ useTimeZone: () => 'UTC' }));
jest.mock('@/features/session/start', () => ({
  useStartWorkout: () => ({ startDay: jest.fn(), startEmpty: jest.fn() }),
}));
jest.mock('./NewPlanSheet', () => ({ NewPlanSheet: () => null }));
jest.mock('./PlanDetailScreen', () => ({ PlanSheets: () => null }));

const exercise = (i: number) => ({
  id: `d-${i}`,
  exerciseId: `x${i}`,
  position: i,
  targetSets: 3,
  targetReps: '8-12',
  restS: 90,
  notes: null,
  supersetWithNext: false,
  drops: null,
  exercise: {
    id: `x${i}`,
    ownerId: null,
    name: ['Bench press', 'Overhead press', 'Dips', 'Fly', 'Pushdown', 'Raise'][i],
    primaryMuscle: 'chest' as const,
    secondaryMuscles: [],
    equipment: 'barbell',
    logType: 'weight_reps' as const,
    imagePath: null,
  },
});
const day = (id: string, name: string, n: number): PlanDayView => ({
  id,
  position: 0,
  name,
  exercises: Array.from({ length: n }, (_, i) => exercise(i)),
});
const mockPlan: PlanView = {
  id: 'p',
  name: 'Push Pull Legs',
  goal: null,
  status: 'active',
  source: 'manual',
  days: [day('a', 'Push A', 6), day('b', 'Pull A', 2), day('c', 'Legs', 2)],
};
const mockPull = {
  id: 's1',
  plan_day_id: 'b',
  cycle_number: 2,
  started_at: '2026-10-15T10:00:00.000Z',
  out_of_order: true,
  day_name: 'Pull A',
};
const mockPush = {
  ...mockPull,
  id: 's0',
  plan_day_id: 'a',
  cycle_number: 1,
  started_at: '2026-10-14T10:00:00.000Z',
  out_of_order: false,
};
const mockRotation: Rotation = {
  state: { cycle: 2, doneDayIds: new Set(['b']), upNextDayId: 'a', doneCount: 1, totalDays: 3 },
  doneThisCycle: new Map([['b', mockPull]]),
};

jest.mock('./plans', () => ({
  ...jest.requireActual('./plans'),
  useActivePlan: () => ({ plan: mockPlan, data: [mockPlan], isPending: false }),
  useRotation: () => mockRotation,
  usePlanSessions: () => ({ data: [mockPull, mockPush] }),
}));

let mockTrend: { day: string; est1rmKg: number | null; maxKg: number | null }[] = [];
jest.mock('./history', () => ({
  useLastSessionDay: () => ({ data: '2026-10-17' }),
  useMonthSessions: () => ({
    isPending: false,
    data: [
      {
        id: 's1',
        name: 'Pull A',
        startedAt: '2026-10-15T10:00:00.000Z',
        endedAt: null,
        outOfOrder: true,
        feeling: null,
        notes: null,
        planId: 'p',
        planName: 'Push Pull Legs',
        stats: { minutes: 50, volumeKg: 4200, sets: 18 },
        exercises: [],
      },
    ],
  }),
  useExerciseSessions: () => ({ isPending: false, data: [] }),
}));
jest.mock('./exercises', () => ({
  ...jest.requireActual('./exercises'),
  useExercises: () => ({
    data: [
      {
        id: 'x0',
        ownerId: null,
        name: 'Bench press',
        primaryMuscle: 'chest',
        secondaryMuscles: [],
        equipment: 'barbell',
        logType: 'weight_reps',
        imagePath: null,
      },
    ],
  }),
  useDeleteExercise: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('./exercise-stats', () => ({
  ...jest.requireActual('./exercise-stats'),
  useRecords: () => ({ data: new Map() }),
  useExerciseTrend: () => ({ data: mockTrend }),
}));

describe('Train', () => {
  it('up next with its exercises and last time, the cycle as a bar and day tiles', async () => {
    await renderUI(<TrainScreen />);
    expect(screen.getByText('Last workout yesterday')).toBeTruthy();
    expect(screen.getByText('6 exercises · ~40 min · last time 4 days ago')).toBeTruthy();
    expect(screen.getByText('Bench press')).toBeTruthy();
    expect(screen.getByText('+3 more')).toBeTruthy();
    expect(screen.getByText('Start Push A')).toBeTruthy();
    expect(screen.getByLabelText('Cycle 2, 1 of 3 days done')).toBeTruthy();
    expect(screen.getByLabelText('Pull A, Done Thu')).toBeTruthy();
    expect(screen.getByLabelText('Legs, To do')).toBeTruthy();
    // The active plan says so with a training chip, not a border.
    expect(screen.getByText('Active')).toBeTruthy();
  });
});

describe('History', () => {
  it('uses the shared month grid: a trained day has the training dot and says "trained"', async () => {
    await renderUI(<HistoryScreen sessionRoute="/train/history/[sessionId]" />);
    expect(screen.getByLabelText('Thursday 15, trained')).toBeTruthy();
    expect(screen.getByTestId('trained-2026-10-15', { includeHiddenElements: true })).toHaveStyle({
      backgroundColor: color.training,
    });
    expect(screen.getByText('Out of order')).toBeTruthy();
  });

  it('a tap on a day shows that day only; Whole month brings the month back', async () => {
    await renderUI(<HistoryScreen sessionRoute="/train/history/[sessionId]" />);
    await fireEvent.press(screen.getByLabelText('Friday 16'));
    expect(screen.getByText('No workout on this day')).toBeTruthy();
    expect(screen.getByLabelText('Friday 16')).toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: 'Whole month' }));
    expect(screen.getByText('Out of order')).toBeTruthy();
  });
});

describe('Exercise detail', () => {
  it('the change is a green pill with an arrow when stronger', async () => {
    mockTrend = [
      { day: '2026-10-01', est1rmKg: 86, maxKg: 80 },
      { day: '2026-10-08', est1rmKg: 93, maxKg: 82.5 },
    ];
    await renderUI(
      <ExerciseDetailScreen exerciseId="x0" sessionRoute="/train/history/[sessionId]" />,
    );
    expect(screen.getByText('+7 kg · 2 sessions')).toBeTruthy();
    expect(screen.getByLabelText('Rising from 86 to 93 kg')).toBeTruthy();
  });

  it('weaker: red and falling; one day only: a line saying how to get a trend', async () => {
    mockTrend = [
      { day: '2026-10-01', est1rmKg: 93, maxKg: 80 },
      { day: '2026-10-08', est1rmKg: 90, maxKg: 80 },
    ];
    await renderUI(
      <ExerciseDetailScreen exerciseId="x0" sessionRoute="/train/history/[sessionId]" />,
    );
    expect(screen.getByText('−3 kg · 2 sessions')).toBeTruthy();
    expect(screen.getByLabelText('Falling from 93 to 90 kg')).toBeTruthy();

    mockTrend = [{ day: '2026-10-01', est1rmKg: 93, maxKg: 80 }];
    await renderUI(
      <ExerciseDetailScreen exerciseId="x0" sessionRoute="/train/history/[sessionId]" />,
    );
    expect(screen.getByText('Do it on two days to see the trend here')).toBeTruthy();
  });
});

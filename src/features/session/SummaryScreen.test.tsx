import { act, fireEvent, screen } from '@testing-library/react-native';
import '@/i18n';
import { renderUI } from '@/test/render';
import { buildSession, toggleSet, totals, type NewExercise } from './logic';
import { useSessionStore } from './store';
import { SummaryScreen } from './SummaryScreen';

const mockReplace = jest.fn();
let mockSessionId = '';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({ sessionId: mockSessionId }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('./sync', () => ({ syncPendingSessions: jest.fn(() => Promise.resolve()) }));
jest.mock('./store', () => ({
  ...jest.requireActual('./store'),
  useSessionHydrated: () => true,
}));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('@/features/gamification/data', () => ({
  useTimeZone: () => 'UTC',
  useActivity: () => ({
    data: {
      loggedDays: new Set(['2026-10-16', '2026-10-17']),
      workouts: [],
      dietOnTargetDays: new Set(),
      checkInDays: new Set(),
      exerciseDays: [],
      daily: [],
    },
  }),
}));

const bench: NewExercise = {
  exerciseId: 'bench',
  name: 'Bench press',
  logType: 'weight_reps',
  imagePath: null,
  restS: 90,
  targetSets: 2,
  previous: [{ weightKg: 80, reps: 6, durationS: null, distanceM: null }],
};

describe('Workout summary', () => {
  it('totals, records, streak and next badge, then Done goes back to Home', async () => {
    let s = buildSession({
      planId: null,
      planDayId: null,
      dayName: 'Push A',
      cycleNumber: null,
      outOfOrder: false,
      weightUnit: 'kg',
      now: new Date('2026-10-18T09:00:00Z'),
      exercises: [bench],
    });
    s = toggleSet(s, 0, 0, new Date('2026-10-18T09:05:00Z')).session;
    mockSessionId = s.id;
    const endedAt = new Date('2026-10-18T09:40:00Z');
    await act(async () =>
      useSessionStore.setState({
        active: null,
        finished: {
          [s.id]: {
            userId: 'u',
            session: s,
            endedAt: endedAt.toISOString(),
            feeling: null,
            notes: '',
            records: [
              {
                exerciseId: 'bench',
                name: 'Bench press',
                kind: 'max',
                value: 80,
                was: 77.5,
                reps: 6,
              },
            ],
            totals: totals(s, endedAt),
            synced: false,
          },
        },
      }),
    );

    await renderUI(<SummaryScreen />);
    expect(screen.getByText('Workout done')).toBeTruthy();
    expect(screen.getByText('1 new record today')).toBeTruthy();
    expect(screen.getByText('40:00')).toBeTruthy();
    // Volume with its tile, and no second line repeating the duration.
    expect(screen.getByText('480')).toBeTruthy();
    expect(screen.queryByText(/minutes of training/)).toBeNull();
    expect(screen.getByText('New max')).toBeTruthy();
    // The workout just finished counts for the streak (two days before + today).
    expect(screen.getByText('3 day streak')).toBeTruthy();
    expect(screen.getByText('Next badge', { includeHiddenElements: true })).toBeTruthy();
    // The streak badge is said once (on the streak card); the badge card shows another one.
    expect(screen.getByText('4 more days for the 7-day streak badge.')).toBeTruthy();
    expect(screen.queryByText('7-day streak', { includeHiddenElements: true })).toBeNull();

    await fireEvent.press(screen.getByText('Done'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });
});

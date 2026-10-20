import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { WorkoutWidget } from './Widgets';

const mockPush = jest.fn();
const mockStart = jest.fn();
type Day = { id: string; name: string; exercises: { id: string; exercise: { name: string } }[] };
let mockUpNext: Day | undefined;
let mockDone: { name: string; stats: { sets: number } }[] = [];
const plan = { id: 'p1', name: 'PPL' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/components/ui/TabBar', () => ({ useTabBarHeight: () => 80 }));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('@/features/train/plans', () => ({ estimateMinutes: () => 40 }));
jest.mock('@/features/train/NewPlanSheet', () => ({ NewPlanSheet: () => null }));
jest.mock('@/features/session/start', () => ({
  useStartWorkout: () => ({ startDay: mockStart }),
}));
jest.mock('@/features/ai/use-coach-ready', () => ({
  useCoachReady: () => false,
  useAskCoach: () => jest.fn(),
}));
jest.mock('./day-status', () => ({
  useTodayWorkout: () => ({
    plan,
    rotation: { state: { cycle: 1, doneCount: 1, totalDays: 3 } },
    upNext: mockUpNext,
    doneToday: mockDone,
  }),
}));

const ex = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i}`, exercise: { name: `Exercise ${i}` } }));

beforeEach(() => {
  mockPush.mockClear();
  mockStart.mockClear();
  mockDone = [];
  mockUpNext = { id: 'd1', name: 'Push A', exercises: ex(5) };
});

describe('Home · workout card states', () => {
  it('up next: the day, its first exercises, Start and another day', async () => {
    await renderUI(<WorkoutWidget size="large" />);
    expect(screen.getByText('Push A')).toBeTruthy();
    expect(screen.getByText('+2 more')).toBeTruthy();
    expect(screen.getByLabelText('Cycle 1 · 1/3')).toBeTruthy();
    await fireEvent.press(screen.getByText('Start'));
    expect(mockStart).toHaveBeenCalled();
    expect(screen.getByText('Train a different day')).toBeTruthy();
  });

  it('a day without exercises: Add exercises opens the plan instead of a dead Start', async () => {
    mockUpNext = { id: 'd1', name: 'Legs', exercises: [] };
    await renderUI(<WorkoutWidget size="large" />);
    expect(screen.queryByText('Start')).toBeNull();
    await fireEvent.press(screen.getByText('Add exercises'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/train/plan/[planId]',
      params: { planId: 'p1' },
    });
  });

  it('done today: a heading with what was done, in both sizes', async () => {
    mockDone = [{ name: 'Push A', stats: { sets: 18 } }];
    await renderUI(<WorkoutWidget size="large" />);
    expect(screen.getByText('Workout done today')).toBeTruthy();
    expect(screen.getByText('Push A · 18 sets')).toBeTruthy();
    expect(screen.queryByText('Start')).toBeNull();
    await renderUI(<WorkoutWidget size="small" />);
    expect(screen.getByText('Workout done today')).toBeTruthy();
  });
});

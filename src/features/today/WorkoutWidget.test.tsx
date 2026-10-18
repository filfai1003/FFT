import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { WorkoutWidget } from './Widgets';

const mockPush = jest.fn();
const mockAsk = jest.fn();
let mockCoachReady = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/components/ui/TabBar', () => ({ useTabBarHeight: () => 80 }));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('@/features/profile/api', () => ({
  useProfile: () => ({ data: { diet_mode: 'tracking', timezone: 'UTC' } }),
}));
jest.mock('@/features/train/plans', () => ({
  useActivePlan: () => ({ plan: null, data: [], isPending: false }),
  useRotation: () => null,
  estimateMinutes: () => 0,
  useCreatePlan: () => ({ mutateAsync: jest.fn(), isPending: false, isError: false }),
}));
jest.mock('@/features/train/history', () => ({ useMonthSessions: () => ({ data: [] }) }));
jest.mock('@/features/session/start', () => ({ useStartWorkout: () => ({ startDay: jest.fn() }) }));
jest.mock('@/features/ai/use-coach-ready', () => ({
  useCoachReady: () => mockCoachReady,
  useAskCoach: () => mockAsk,
}));

describe('Home · workout card without a plan', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockAsk.mockClear();
  });

  it('Create a plan opens plan creation right there', async () => {
    mockCoachReady = false;
    await renderUI(<WorkoutWidget size="large" />);
    expect(screen.queryByText('Go to Train')).toBeNull();
    expect(screen.queryByText('Ask the coach for a plan')).toBeNull();
    await fireEvent.press(screen.getByText('Create a plan'));
    expect(screen.getByLabelText('Plan name')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('with the coach set up and agreed to: a second way, asking the coach', async () => {
    mockCoachReady = true;
    await renderUI(<WorkoutWidget size="large" />);
    await fireEvent.press(screen.getByText('Ask the coach for a plan'));
    expect(mockAsk).toHaveBeenCalledWith(expect.stringContaining('workout plan'));
  });
});

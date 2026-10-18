import '@/i18n';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { useToastStore } from '@/lib/toast-store';
import { DietGoalsScreen } from './DietGoalsScreen';

const mockSaveGoal = jest.fn(async (_g: unknown) => undefined);
const mockUndo = jest.fn(async () => undefined);
const mockRemoveTarget = jest.fn(async (_a: unknown) => mockUndo);
let mockGoals: Record<string, unknown>[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('@/features/profile/api', () => ({
  useProfile: () => ({
    data: {
      diet_mode: 'tracking',
      goal: null,
      sex: null,
      birth_date: null,
      height_cm: null,
      activity_level: null,
    },
  }),
  useLatestWeight: () => ({ data: null }),
  useUpdateProfile: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('./fixed', () => ({
  useFixedPlan: () => ({ data: null }),
  useSaveFixedPlan: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('./log', () => ({
  useGoals: () => ({ data: mockGoals, isPending: false }),
  useSaveGoal: () => ({ mutateAsync: mockSaveGoal, isPending: false }),
  useRemoveTarget: () => ({ mutateAsync: mockRemoveTarget, isPending: false }),
}));

const goal = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  validFrom: '2026-10-01',
  kcal: 2200,
  proteinG: 150,
  carbsG: 250,
  fatG: 65,
  trainingDayBonusKcal: 0,
  maintenanceKcal: null,
  waterMl: 2500,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  useToastStore.setState({ toast: null });
});

describe('Diet goals: a target or none (DECISIONS 104)', () => {
  it('removing the target saves "no target" and offers UNDO', async () => {
    mockGoals = [goal()];
    await renderUI(<DietGoalsScreen />);
    expect(screen.getByText('Daily calories')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'No target' }));
    expect(screen.queryByText('Daily calories')).toBeNull();
    await fireEvent.press(screen.getByText('Save goals'));
    await waitFor(() => expect(mockRemoveTarget).toHaveBeenCalled());
    expect(mockRemoveTarget.mock.calls[0][0]).toMatchObject({
      day: '2026-10-18',
      current: { kcal: 2200 },
    });
    expect(mockSaveGoal).not.toHaveBeenCalled();
    const toast = useToastStore.getState().toast;
    expect(toast?.message).toBe('Target removed');
    toast?.onAction?.();
    expect(mockUndo).toHaveBeenCalled();
  });

  it('without a target, setting one starts from a safe default and saves it', async () => {
    mockGoals = [
      goal({ kcal: null, proteinG: null, carbsG: null, fatG: null, validFrom: '2026-10-10' }),
    ];
    await renderUI(<DietGoalsScreen />);
    expect(screen.queryByText('Daily calories')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Set a target' }));
    expect(screen.getByText('Daily calories')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save goals'));
    await waitFor(() => expect(mockSaveGoal).toHaveBeenCalled());
    const saved = mockSaveGoal.mock.calls[0][0] as { kcal: number; waterMl: number };
    expect(saved.kcal).toBe(2000);
    expect(saved.kcal).toBeGreaterThanOrEqual(1500);
    expect(saved.waterMl).toBe(2500);
    expect(mockRemoveTarget).not.toHaveBeenCalled();
  });

  it('keeping "no target" writes nothing to the goals', async () => {
    mockGoals = [];
    await renderUI(<DietGoalsScreen />);
    expect(screen.getByRole('radio', { name: 'No target', checked: true })).toBeTruthy();
    await fireEvent.press(screen.getByText('Save goals'));
    await waitFor(() => expect(useToastStore.getState().toast).toBeNull());
    expect(mockSaveGoal).not.toHaveBeenCalled();
    expect(mockRemoveTarget).not.toHaveBeenCalled();
  });
});

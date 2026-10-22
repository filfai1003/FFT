import '@/i18n';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { useToastStore } from '@/lib/toast-store';
import { suggestedKcal } from '@/domain/nutrition';
import { DietGoalsScreen } from './DietGoalsScreen';

const mockSaveGoal = jest.fn(async (_g: unknown) => undefined);
const mockUndo = jest.fn(async () => undefined);
const mockRemoveTarget = jest.fn(async (_a: unknown) => mockUndo);
let mockGoals: Record<string, unknown>[] = [];
const mockSaveWater = jest.fn(async (_v: unknown) => undefined);

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
  useSaveWaterTarget: () => ({ mutateAsync: mockSaveWater, isPending: false }),
}));
// 70 kg, 25 years, a man, trained today: 2.45 L + 0.5 L = 2.95 L (DECISIONS 127).
jest.mock('./water-target', () => ({
  useWaterTarget: () => {
    const g = mockGoals.at(-1) as { waterMl: number; waterAuto: boolean } | undefined;
    return {
      target: jest.requireActual('@/domain/hydration').effectiveWaterTarget(g ?? null, {
        weightKg: 70,
        ageYears: 25,
        sex: 'male',
        trainedToday: true,
      }),
    };
  },
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
  waterAuto: false,
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
    await fireEvent.press(screen.getByText('Save targets'));
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
    await fireEvent.press(screen.getByText('Save targets'));
    await waitFor(() => expect(mockSaveGoal).toHaveBeenCalled());
    const saved = mockSaveGoal.mock.calls[0][0] as { kcal: number; waterMl: number };
    expect(saved.kcal).toBe(2000);
    expect(saved.kcal).toBeGreaterThanOrEqual(1500);
    expect(saved.waterMl).toBe(2500);
    expect(mockRemoveTarget).not.toHaveBeenCalled();
  });

  it('marks a target equal to the suggestion "Suggested for you" (DECISIONS 112)', async () => {
    const suggested = suggestedKcal(2600, 'maintain');
    mockGoals = [goal({ kcal: suggested, maintenanceKcal: 2600 })];
    await renderUI(<DietGoalsScreen />);
    expect(screen.getByText('Suggested for you')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Raise calories by 50'));
    expect(screen.queryByText('Suggested for you')).toBeNull();
  });

  it('keeping "no target" writes nothing to the goals', async () => {
    mockGoals = [];
    await renderUI(<DietGoalsScreen />);
    expect(screen.getByRole('radio', { name: 'No target', checked: true })).toBeTruthy();
    await fireEvent.press(screen.getByText('Save targets'));
    await waitFor(() => expect(useToastStore.getState().toast).toBeNull());
    expect(mockSaveGoal).not.toHaveBeenCalled();
    expect(mockRemoveTarget).not.toHaveBeenCalled();
  });
});

describe('Diet targets: the water target (DECISIONS 127)', () => {
  it('automatic by default, with the user’s own breakdown in What’s this', async () => {
    mockGoals = [goal({ waterAuto: true, waterMl: 2000 })];
    await renderUI(<DietGoalsScreen />);
    expect(screen.getByText('Automatic · 2.95 L')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Automatic', checked: true })).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('About the water target'));
    expect(screen.getByText('Base: 70 kg × 35 ml = 2.45 L')).toBeTruthy();
    expect(screen.getByText('Training today: + 0.5 L')).toBeTruthy();
    expect(screen.getByText('Your target: 2.95 L')).toBeTruthy();
    expect(screen.getByText(/Food also contains water/)).toBeTruthy();
  });

  it('“Set my own” starts from the automatic target and saves the user’s number', async () => {
    mockGoals = [goal({ waterAuto: true, waterMl: 2000 })];
    await renderUI(<DietGoalsScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Set my own' }));
    expect(screen.getByText('Your own · 3 L')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Raise water target by 100 ml'));
    expect(screen.getByText('Your own · 3.1 L')).toBeTruthy();
    expect(screen.getByText('Automatic would be 2.95 L today.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save targets'));
    await waitFor(() => expect(mockSaveGoal).toHaveBeenCalled());
    expect(mockSaveGoal.mock.calls[0][0]).toMatchObject({ waterMl: 3100, waterAuto: false });
  });

  it('back to automatic keeps the last own number on the row', async () => {
    mockGoals = [goal({ waterAuto: false, waterMl: 2500 })];
    await renderUI(<DietGoalsScreen />);
    expect(screen.getByText('Your own · 2.5 L')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Automatic' }));
    await fireEvent.press(screen.getByText('Save targets'));
    await waitFor(() => expect(mockSaveGoal).toHaveBeenCalled());
    expect(mockSaveGoal.mock.calls[0][0]).toMatchObject({ waterMl: 2500, waterAuto: true });
  });

  it('without a calorie target only the water is saved', async () => {
    mockGoals = [];
    await renderUI(<DietGoalsScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Set my own' }));
    await fireEvent.press(screen.getByText('Save targets'));
    await waitFor(() => expect(mockSaveWater).toHaveBeenCalled());
    expect(mockSaveWater.mock.calls[0][0]).toMatchObject({
      day: '2026-10-18',
      current: null,
      water: { auto: false, ml: 3000 },
    });
    expect(mockSaveGoal).not.toHaveBeenCalled();
  });
});

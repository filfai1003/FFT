import '@/i18n';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { useToastStore } from '@/lib/toast-store';
import { NutritionWidget } from './Widgets';

const mockPush = jest.fn();
let mockTarget: { kcal: number; protein: number; carbs: number; fat: number } | null = null;
let mockTotals = { kcal: 850, protein: 40, carbs: 90, fat: 30 };
type Entry = { id: string; meal: string; name: string; macros: { kcal: number } };
let mockLogs: Record<string, Entry[]> = {};
let mockDietMode = 'tracking';
let mockChecks: { fixedMealId: string; status: string }[] = [];
const mockCopy = jest.fn(async (a: { entries: Entry[] }) => a.entries.map((e) => `new-${e.id}`));
const mockSetDeleted = jest.fn();
const mockSetCheck = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/components/ui/TabBar', () => ({ useTabBarHeight: () => 80 }));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('@/features/profile/api', () => ({
  useProfile: () => ({ data: { diet_mode: mockDietMode, timezone: 'UTC' } }),
}));
jest.mock('@/features/diet/day-hooks', () => ({ useDayTarget: () => mockTarget }));
jest.mock('@/features/diet/fixed', () => ({
  useFixedPlan: () => ({
    data:
      mockDietMode === 'fixed_meals'
        ? {
            meals: [
              {
                id: 'm1',
                name: 'Breakfast',
                position: 0,
                kcal: 500,
                proteinG: 30,
                carbsG: 50,
                fatG: 15,
                description: null,
              },
            ],
          }
        : null,
  }),
  useFixedChecks: () => ({ data: mockChecks }),
  useSetCheck: () => ({ mutate: mockSetCheck }),
}));
jest.mock('@/features/diet/log', () => ({
  useDayTotals: () => ({ data: mockTotals }),
  useDayLog: (day: string) => ({ data: mockLogs[day] ?? [] }),
  useCopyEntries: () => ({ mutateAsync: mockCopy, isPending: false }),
  useSetLogDeleted: () => ({ mutate: mockSetDeleted }),
  useAddWater: () => ({ mutate: jest.fn() }),
  useRemoveWater: () => ({ mutate: jest.fn() }),
  useWater: () => ({ data: null }),
}));

const entry = (id: string, meal: string, kcal: number): Entry => ({
  id,
  meal,
  name: id,
  macros: { kcal },
});

beforeEach(() => {
  mockTotals = { kcal: 850, protein: 40, carbs: 90, fat: 30 };
  mockLogs = { '2026-10-18': [entry('today', 'lunch', 850)] };
  mockDietMode = 'tracking';
  mockChecks = [];
  jest.clearAllMocks();
});

describe('Home · calories card', () => {
  it('with a target: calories left and the target', async () => {
    mockTarget = { kcal: 2000, protein: 150, carbs: 200, fat: 60 };
    await renderUI(<NutritionWidget size="large" />);
    expect(screen.getByText('1,150')).toBeTruthy();
    expect(screen.getByText('kcal left')).toBeTruthy();
    expect(screen.getByText('40 / 150 g')).toBeTruthy();
  });

  it('over the target: how much over, never "0 kcal left"', async () => {
    mockTarget = { kcal: 2000, protein: 150, carbs: 200, fat: 60 };
    mockTotals = { kcal: 2250, protein: 160, carbs: 220, fat: 70 };
    await renderUI(<NutritionWidget size="large" />);
    expect(screen.getByText('250')).toBeTruthy();
    expect(screen.getByText('kcal over')).toBeTruthy();
    expect(screen.queryByText('kcal left')).toBeNull();
    expect(screen.getByText('20 g over')).toBeTruthy();
    await renderUI(<NutritionWidget size="small" />);
    expect(screen.getByRole('header', { name: 'Calories' })).toBeTruthy();
    expect(screen.getByText('kcal over')).toBeTruthy();
  });

  it('fixed meals, all ticked: a filled check and the words', async () => {
    mockTarget = { kcal: 2000, protein: 150, carbs: 200, fat: 60 };
    mockDietMode = 'fixed_meals';
    mockChecks = [{ fixedMealId: 'm1', status: 'done' }];
    await renderUI(<NutritionWidget size="large" />);
    expect(screen.getByText('All meals done for today.')).toBeTruthy();
    expect(screen.queryByText('Mark Breakfast as eaten')).toBeNull();
  });

  it('no target (DECISIONS 104): eaten and macros, no "left", and a link to set one', async () => {
    mockTarget = null;
    await renderUI(<NutritionWidget size="large" />);
    expect(screen.getByText('Eaten')).toBeTruthy();
    expect(screen.getByText('850')).toBeTruthy();
    expect(screen.getByText('40 g')).toBeTruthy();
    expect(screen.queryByText('kcal left')).toBeNull();
    expect(screen.queryByText('Target')).toBeNull();
    await fireEvent.press(screen.getByText('Set a target'));
    expect(mockPush).toHaveBeenCalledWith('/diet-goals');
  });

  it('no target, small tile: kcal eaten instead of left', async () => {
    mockTarget = null;
    await renderUI(<NutritionWidget size="small" />);
    expect(screen.getByText('850')).toBeTruthy();
    expect(screen.getByText('kcal eaten')).toBeTruthy();
    expect(screen.queryByText('kcal left')).toBeNull();
  });
});

describe('Home · calories card with nothing logged yet', () => {
  beforeEach(() => {
    mockTarget = { kcal: 2000, protein: 150, carbs: 200, fat: 60 };
    mockTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    mockLogs = {};
  });

  it('looks like the full card, unfilled: 0 of the target, empty macro bars with their targets', async () => {
    await renderUI(<NutritionWidget size="large" />);
    expect(screen.getByText('2,000')).toBeTruthy();
    expect(screen.getByText('kcal left')).toBeTruthy();
    expect(screen.getByText('0 of 2,000')).toBeTruthy();
    expect(screen.getByText('0 / 150 g')).toBeTruthy();
    expect(screen.getByText('0 / 200 g')).toBeTruthy();
    expect(screen.getByText('0 / 60 g')).toBeTruthy();
    expect(screen.getByText('150 g left')).toBeTruthy();
    expect(screen.queryByText('Same as yesterday')).toBeNull();
    await fireEvent.press(screen.getByText('Log a meal'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/food-search' }));
  });

  it('Same as yesterday copies every meal of yesterday, with UNDO', async () => {
    mockLogs = {
      '2026-10-17': [
        entry('a', 'breakfast', 400),
        entry('b', 'lunch', 600),
        entry('c', 'lunch', 1),
      ],
    };
    await renderUI(<NutritionWidget size="large" />);
    expect(screen.getByLabelText('Same as yesterday: 3 foods, 1,001 kcal')).toBeTruthy();
    await fireEvent.press(screen.getByText('Same as yesterday'));
    expect(mockCopy).toHaveBeenCalledTimes(2);
    expect(mockCopy).toHaveBeenCalledWith(
      expect.objectContaining({ day: '2026-10-18', meal: 'lunch' }),
    );
    const toast = useToastStore.getState().toast;
    expect(toast?.message).toBe('3 foods from yesterday logged');
    await act(() => toast?.onAction?.());
    expect(mockSetDeleted).toHaveBeenCalledTimes(3);
    expect(mockSetDeleted).toHaveBeenCalledWith({ id: 'new-a', deleted: true });
  });

  it('fixed meals: tick the next meal in one tap', async () => {
    mockDietMode = 'fixed_meals';
    await renderUI(<NutritionWidget size="large" />);
    expect(screen.getByText('2,000')).toBeTruthy();
    expect(screen.getByText('Breakfast')).toBeTruthy();
    expect(screen.queryByText('Same as yesterday')).toBeNull();
    await fireEvent.press(screen.getByText('Mark Breakfast as eaten'));
    expect(mockSetCheck).toHaveBeenCalledWith(
      expect.objectContaining({ day: '2026-10-18', mealId: 'm1' }),
    );
  });

  it('small tile: the empty arc with the whole target left, and its one-tap button', async () => {
    await renderUI(<NutritionWidget size="small" />);
    expect(screen.getByText('2,000')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Calories left' })).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Log a meal'));
    expect(mockPush).toHaveBeenCalled();
  });
});

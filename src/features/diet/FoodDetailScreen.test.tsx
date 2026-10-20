import '@/i18n';
import { screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { FoodDetailScreen } from './FoodDetailScreen';
import type { Food } from './foods';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ foodId: 'f1', meal: 'snack', day: '2026-10-18' }),
}));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('./MealSheet', () => ({ MealSheet: () => null }));
let mockTarget: { kcal: number; protein: number; carbs: number; fat: number } | null = null;
jest.mock('./day-hooks', () => ({ useDayTarget: () => mockTarget }));

const yogurt: Food = {
  id: 'f1',
  ownerId: null,
  barcode: null,
  name: 'Greek yogurt 2%',
  brand: 'Fage',
  per100: { kcal: 73, protein: 10, carbs: 3.6, fat: 2 },
  source: 'off',
  verified: true,
  servings: [],
};
let mockFood: { data?: Food; isError?: boolean } = { data: yogurt };
jest.mock('./foods', () => ({
  useFood: () => mockFood,
  useSetFoodDeleted: () => ({ mutate: jest.fn() }),
}));
jest.mock('./log', () => ({
  useDayLog: () => ({ data: [] }),
  useLogFood: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetLogDeleted: () => ({ mutate: jest.fn() }),
}));

describe('Food detail (DECISIONS 112)', () => {
  beforeEach(() => {
    mockFood = { data: yogurt };
    mockTarget = null;
  });

  it("with a target: each macro tile says this portion's share of the day's goal", async () => {
    mockTarget = { kcal: 2000, protein: 100, carbs: 200, fat: 60 };
    await renderUI(<FoodDetailScreen />);
    expect(screen.getByText('Verified · Open Food Facts · Fage')).toBeTruthy();
    expect(screen.getByText('73')).toBeTruthy();
    expect(screen.getByText('10% of goal')).toBeTruthy();
    expect(screen.getByLabelText('Protein, 10% of goal')).toBeTruthy();
  });

  it('without a target: grams only, no goal bars', async () => {
    await renderUI(<FoodDetailScreen />);
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.queryByText(/% of goal/)).toBeNull();
  });

  it('while the food loads: placeholders; a food that is gone says so', async () => {
    mockFood = {};
    await renderUI(<FoodDetailScreen />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    mockFood = { isError: true };
    await renderUI(<FoodDetailScreen />);
    expect(screen.getByText('This food is no longer available')).toBeTruthy();
  });
});

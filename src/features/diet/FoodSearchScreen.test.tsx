import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { FoodSearchScreen } from './FoodSearchScreen';
import type { Food } from './foods';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ meal: 'snack', day: '2026-10-18' }),
}));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('./QuickAddSheet', () => ({ QuickAddSheet: () => null }));
jest.mock('./MealSheet', () => ({ MealSheet: () => null }));

const yogurt: Food = {
  id: 'f1',
  ownerId: null,
  barcode: null,
  name: 'Greek yogurt 2%',
  brand: null,
  per100: { kcal: 73, protein: 10, carbs: 3.6, fat: 2 },
  source: 'off',
  verified: true,
  servings: [],
};
let mockRecent: Food[] = [];
jest.mock('./foods', () => ({
  useFoodSearch: () => ({ data: [], isFetching: false }),
  useRecentFoods: () => ({ data: mockRecent }),
  useMyFoods: () => ({ data: [] }),
}));
jest.mock('./off', () => ({
  useOffSearch: () => ({ data: [], isFetching: false }),
  mergeFoods: (a: Food[] = [], b: Food[] = []) => [...a, ...b],
}));

describe('Food search (DECISIONS 112)', () => {
  beforeEach(() => {
    mockRecent = [];
    mockPush.mockClear();
  });

  it('a result shows its kcal, a verified tick read aloud, and a one-tap add', async () => {
    mockRecent = [yogurt];
    await renderUI(<FoodSearchScreen />);
    expect(screen.getByRole('button', { name: 'Greek yogurt 2%, Verified, 73 kcal' })).toBeTruthy();
    expect(screen.getByText('100 g · P 10 · C 3.6 · F 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose amount of Greek yogurt 2%' })).toBeTruthy();
  });

  it('nothing found: says so and offers to create the food', async () => {
    await renderUI(<FoodSearchScreen />);
    await fireEvent.changeText(screen.getByLabelText('Search food'), 'zzz');
    expect(screen.getByText('No foods found')).toBeTruthy();
    await fireEvent.press(screen.getByText("Can't find it? Create a food"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/food/new',
      params: { meal: 'snack', day: '2026-10-18' },
    });
  });

  it('opens with the search field focused', async () => {
    await renderUI(<FoodSearchScreen />);
    expect(screen.getByLabelText('Search food').props.autoFocus).toBe(true);
  });

  it('nothing typed: Recent is selected when there are recents; typing switches to Results', async () => {
    mockRecent = [yogurt];
    await renderUI(<FoodSearchScreen />);
    expect(screen.getByRole('radio', { name: 'Recent' }).props.accessibilityState.checked).toBe(
      true,
    );
    await fireEvent.changeText(screen.getByLabelText('Search food'), 'yo');
    expect(screen.getByRole('radio', { name: 'Results' }).props.accessibilityState.checked).toBe(
      true,
    );
    await fireEvent.changeText(screen.getByLabelText('Search food'), '');
    expect(screen.getByRole('radio', { name: 'Recent' }).props.accessibilityState.checked).toBe(
      true,
    );
  });

  it('no recents yet: Results is selected, asking to type', async () => {
    await renderUI(<FoodSearchScreen />);
    expect(screen.getByRole('radio', { name: 'Results' }).props.accessibilityState.checked).toBe(
      true,
    );
  });

  it('an empty "Mine" tab explains where your own foods come from', async () => {
    await renderUI(<FoodSearchScreen />);
    await fireEvent.press(screen.getByText('Mine'));
    expect(screen.getByText('No foods of your own yet')).toBeTruthy();
  });
});

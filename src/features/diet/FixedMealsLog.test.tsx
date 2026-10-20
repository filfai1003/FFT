import '@/i18n';
import { screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { FixedMealsLog } from './FixedMealsLog';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('./day-hooks', () => ({
  useDietDay: () => ({ day: '2026-10-18', today: '2026-10-18', setDay: jest.fn() }),
  useDayTarget: () => null,
}));
const meal = (id: string, position: number, name: string) => ({
  id,
  position,
  name,
  kcal: 600,
  proteinG: 40,
  carbsG: 70,
  fatG: 15,
  description: '',
  isMain: false,
});
let mockMeals: ReturnType<typeof meal>[] = [];
let mockChecks: unknown[] = [];
jest.mock('./fixed', () => ({
  useFixedPlan: () => ({ data: { meals: mockMeals }, isPending: false }),
  useFixedChecks: () => ({ data: mockChecks, isPending: false }),
  useSetCheck: () => ({ mutate: jest.fn() }),
}));
jest.mock('./log', () => ({ useDayLog: () => ({ data: [] }) }));
jest.mock('./week-status', () => ({ useStripStatuses: () => null }));
jest.mock('./DayPickerSheet', () => ({ DayPickerSheet: () => null }));
jest.mock('./AdjustMealSheet', () => ({ AdjustMealSheet: () => null }));

describe('Diet tab · fixed meals', () => {
  beforeEach(() => {
    mockMeals = [];
    mockChecks = [];
  });

  it('is titled "Diet", like the count-foods mode', async () => {
    await renderUI(<FixedMealsLog />);
    expect(screen.getByRole('header', { name: 'Diet' })).toBeTruthy();
    expect(screen.queryByText('Food log')).toBeNull();
  });

  it('without a target shows what was eaten and offers to set one (DECISIONS 104)', async () => {
    await renderUI(<FixedMealsLog />);
    expect(screen.getByText('Eaten')).toBeTruthy();
    expect(screen.getByText('Set a target')).toBeTruthy();
    expect(screen.queryByText('kcal left')).toBeNull();
  });

  it('a plan without meals says so and leads to setting them up (DECISIONS 112)', async () => {
    await renderUI(<FixedMealsLog />);
    expect(screen.getByText('No meals in your plan yet')).toBeTruthy();
    expect(screen.getByText('Set up meals')).toBeTruthy();
  });

  it('marks the next meal "Up next" and an eaten one "Done", with the meals count', async () => {
    mockMeals = [meal('a', 0, 'Breakfast'), meal('b', 1, 'Lunch')];
    mockChecks = [
      { id: 'c', fixedMealId: 'a', status: 'done', kcal: 600, proteinG: 40, carbsG: 70, fatG: 15 },
    ];
    await renderUI(<FixedMealsLog />);
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('Up next')).toBeTruthy();
    expect(screen.getByText('1 of 2 meals')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Breakfast done, tap to undo' })).toBeTruthy();
  });
});

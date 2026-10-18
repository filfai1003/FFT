import '@/i18n';
import { screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { FixedMealsLog } from './FixedMealsLog';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('./day-hooks', () => ({
  useDietDay: () => ({ day: '2026-10-18', today: '2026-10-18', setDay: jest.fn() }),
  useDayTarget: () => null,
}));
jest.mock('./fixed', () => ({
  useFixedPlan: () => ({ data: { meals: [] } }),
  useFixedChecks: () => ({ data: [] }),
  useSetCheck: () => ({ mutate: jest.fn() }),
}));
jest.mock('./log', () => ({ useDayLog: () => ({ data: [] }) }));
jest.mock('./DayPickerSheet', () => ({ DayPickerSheet: () => null }));
jest.mock('./AdjustMealSheet', () => ({ AdjustMealSheet: () => null }));

describe('Diet tab · fixed meals', () => {
  it('is titled "Diet", like the count-foods mode', async () => {
    await renderUI(<FixedMealsLog />);
    expect(screen.getByRole('header', { name: 'Diet' })).toBeTruthy();
    expect(screen.queryByText('Food log')).toBeNull();
  });
});

import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { NutritionWidget } from './Widgets';

const mockPush = jest.fn();
let mockTarget: { kcal: number; protein: number; carbs: number; fat: number } | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/components/ui/TabBar', () => ({ useTabBarHeight: () => 80 }));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('@/features/profile/api', () => ({
  useProfile: () => ({ data: { diet_mode: 'tracking', timezone: 'UTC' } }),
}));
jest.mock('@/features/diet/day-hooks', () => ({ useDayTarget: () => mockTarget }));
jest.mock('@/features/diet/fixed', () => ({
  useFixedPlan: () => ({ data: null }),
  useFixedChecks: () => ({ data: [] }),
  useSetCheck: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/diet/log', () => ({
  useDayTotals: () => ({ data: { kcal: 850, protein: 40, carbs: 90, fat: 30 } }),
  useAddWater: () => ({ mutate: jest.fn() }),
  useRemoveWater: () => ({ mutate: jest.fn() }),
  useWater: () => ({ data: null }),
}));

describe('Home · calories card', () => {
  it('with a target: calories left and the target', async () => {
    mockTarget = { kcal: 2000, protein: 150, carbs: 200, fat: 60 };
    await renderUI(<NutritionWidget size="large" />);
    expect(screen.getByText('1,150')).toBeTruthy();
    expect(screen.getByText('kcal left')).toBeTruthy();
    expect(screen.getByText('40 / 150 g')).toBeTruthy();
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

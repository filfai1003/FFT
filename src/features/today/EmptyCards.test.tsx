import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { palettes } from '@/design/tokens';
import { StreakWidget } from '@/features/gamification/StreakWidget';
import { renderUI } from '@/test/render';
import { AddSheet, useAddSheet } from './AddSheet';
import { SupplementsWidget, WeightWidget } from './Widgets';

const mockPush = jest.fn();
const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));
jest.mock('@/components/ui/TabBar', () => ({ useTabBarHeight: () => 80 }));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('@/features/profile/api', () => ({
  useProfile: () => ({ data: { goal: 'maintain', timezone: 'UTC' } }),
}));
jest.mock('@/features/progress/data', () => ({
  useBodyEntries: () => ({ data: [] }),
  useBodyGoal: () => ({ data: null }),
}));
jest.mock('@/features/supplements/data', () => ({
  useSupplements: () => ({ data: [] }),
  useSupplementLogs: () => ({ data: new Map() }),
  useSetTaken: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/supplements/SupplementsSheet', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SupplementsSheet: ({ visible }: { visible: boolean }) =>
      visible ? <View testID="supplements-sheet" /> : null,
  };
});
jest.mock('@/features/gamification/data', () => ({ useGamification: () => null }));
jest.mock('@/features/diet/foods', () => ({
  useRecentFoods: () => ({
    data: [{ id: 'f1', name: 'Greek yogurt', per100: { kcal: 73, protein: 10 } }],
  }),
}));
jest.mock('@/features/diet/log', () => ({
  useAddWater: () => ({ mutate: jest.fn(), mutateAsync: jest.fn() }),
  useRemoveWater: () => ({ mutate: jest.fn() }),
}));

beforeEach(() => {
  mockPush.mockClear();
  mockNavigate.mockClear();
});

describe('Home cards before any data', () => {
  it('weight: the card unfilled (a dash for the number) and a tap logs the first weight', async () => {
    await renderUI(<WeightWidget size="small" />);
    expect(screen.getByText('–')).toBeTruthy();
    expect(screen.getByText('kg')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Log your weight' }));
    expect(mockPush).toHaveBeenCalledWith('/check-in');
  });

  it('supplements: one empty pill opens the list (no second add button in the header)', async () => {
    await renderUI(<SupplementsWidget size="large" />);
    expect(screen.getAllByRole('button', { name: 'Add a supplement' })).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Add a supplement' }));
    expect(screen.getByTestId('supplements-sheet')).toBeTruthy();
  });

  it('streak at day 0: an invitation, not "0-day streak"', async () => {
    await renderUI(<StreakWidget size="large" />);
    expect(screen.getByText('Start a streak')).toBeTruthy();
    expect(screen.queryByText(/0-day streak/)).toBeNull();
  });
});

describe('Add sheet', () => {
  it('tiles in their area colours: food teal, workout purple, water blue', async () => {
    useAddSheet.setState({ open: true });
    await renderUI(<AddSheet />);
    const bg = (name: string | RegExp) =>
      StyleSheet.flatten(screen.getByRole('button', { name }).props.style).backgroundColor;
    expect(bg('Food')).toBe(palettes.light.nutritionSoft);
    expect(bg('Workout')).toBe(palettes.light.trainingSoft);
    expect(bg(/^Water/)).toBe(palettes.light.waterSoft);
    expect(screen.getByRole('button', { name: 'Log Greek yogurt again' })).toBeTruthy();
  });
});

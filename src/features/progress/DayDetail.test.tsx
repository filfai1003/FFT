import '@/i18n';
import { screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { DayDetail } from './DayDetail';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-14' }));
const mockGoal = {
  validFrom: '2026-01-01',
  kcal: 2000,
  proteinG: 150,
  carbsG: 200,
  fatG: 70,
  trainingDayBonusKcal: 0,
};
const mockEaten: { kcal: number } = { kcal: 0 };
jest.mock('@/features/diet/log', () => ({
  useGoals: () => ({ data: [mockGoal] }),
  useDayTotals: () => ({ data: { kcal: mockEaten.kcal, protein: 100, carbs: 150, fat: 50 } }),
}));
const mockMutation = { mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false };
jest.mock('@/features/supplements/data', () => ({
  useSupplements: () => ({ data: [] }),
  useSupplementLogs: () => ({ data: new Map() }),
  useSetTaken: () => mockMutation,
}));
jest.mock('@/features/supplements/SupplementsSheet', () => ({ SupplementsSheet: () => null }));
jest.mock('@/features/train/mark-done', () => ({
  useMarkWorkoutDone: () => mockMutation,
  useSetWorkoutDeleted: () => mockMutation,
}));
jest.mock('@/features/train/plans', () => ({
  useActivePlan: () => ({ plan: null }),
  useRotation: () => null,
}));

describe('Calendar day (DECISIONS 114)', () => {
  it('a past day: eaten against the target as a bar, with on / off target as a chip', async () => {
    mockEaten.kcal = 1950;
    await renderUI(<DayDetail day="2026-10-10" sessions={[]} />);
    expect(screen.getByRole('progressbar', { name: '1950 of 2000 kcal' })).toBeTruthy();
    expect(screen.getByText('On target')).toBeTruthy();
  });

  it('today, still eating: no "off target" verdict yet', async () => {
    mockEaten.kcal = 900;
    await renderUI(<DayDetail day="2026-10-14" sessions={[]} />);
    expect(screen.getByRole('progressbar', { name: '900 of 2000 kcal' })).toBeTruthy();
    expect(screen.queryByText('Off target')).toBeNull();
  });
});

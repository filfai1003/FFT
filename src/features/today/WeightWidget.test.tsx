import '@/i18n';
import { screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { WeightWidget } from './Widgets';

let mockEntries: { day: string; weightKg: number | null }[] = [];
let mockGoal = 'lose_fat';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/components/ui/TabBar', () => ({ useTabBarHeight: () => 80 }));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('@/features/profile/api', () => ({
  useProfile: () => ({ data: { goal: mockGoal, timezone: 'UTC' } }),
}));
jest.mock('@/features/progress/data', () => ({
  useBodyEntries: () => ({ data: mockEntries }),
}));

describe('Home · weight card', () => {
  beforeEach(() => {
    mockGoal = 'lose_fat';
  });

  it('full width: the long date; half width: the compact one ("Logged Sun 18")', async () => {
    mockEntries = [{ day: '2026-10-18', weightKg: 80.4 }];
    await renderUI(<WeightWidget size="large" />);
    expect(screen.getByText('Logged Sun 18 Oct')).toBeTruthy();
    // One weigh-in: dashes where the line will be.
    expect(screen.getByTestId('pending-line', { includeHiddenElements: true })).toBeTruthy();
    await renderUI(<WeightWidget size="small" />);
    expect(screen.getByText('Logged Sun 18')).toBeTruthy();
  });

  it('a big number with its unit, a line of the last weeks and the change with arrow and words', async () => {
    mockEntries = [
      { day: '2026-10-18', weightKg: 80 },
      { day: '2026-10-14', weightKg: 80.2 },
      { day: '2026-10-10', weightKg: 80.5 },
    ];
    await renderUI(<WeightWidget size="small" />);
    expect(screen.getByText('80.0')).toBeTruthy();
    expect(screen.getByText('kg')).toBeTruthy();
    expect(screen.getByLabelText('Weight over the last four weeks')).toBeTruthy();
    expect(screen.getByText('0.5 kg this week')).toBeTruthy();
    expect(screen.getByLabelText('Down 0.5 kg this week')).toBeTruthy();
  });

  it('says when the weight held steady', async () => {
    mockGoal = 'maintain';
    mockEntries = [
      { day: '2026-10-18', weightKg: 80 },
      { day: '2026-10-10', weightKg: 80.02 },
    ];
    await renderUI(<WeightWidget size="large" />);
    expect(screen.getAllByText('Steady this week').length).toBeGreaterThan(0);
  });
});

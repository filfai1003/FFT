import '@/i18n';
import { screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { WeightWidget } from './Widgets';

let mockEntries: { day: string; weightKg: number | null }[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/components/ui/TabBar', () => ({ useTabBarHeight: () => 80 }));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('@/features/profile/api', () => ({
  useProfile: () => ({ data: { goal: 'lose_fat', timezone: 'UTC' } }),
}));
jest.mock('@/features/progress/data', () => ({
  useBodyEntries: () => ({ data: mockEntries }),
}));

describe('Home · weight card in both sizes', () => {
  it('full width: the long date; half width: the compact one ("Logged Sun 18")', async () => {
    mockEntries = [{ day: '2026-10-18', weightKg: 80.4 }];
    await renderUI(<WeightWidget size="large" />);
    expect(screen.getByText('Logged Sun 18 Oct')).toBeTruthy();
    await renderUI(<WeightWidget size="small" />);
    expect(screen.getByText('Logged Sun 18')).toBeTruthy();
  });

  it('half width: a shorter change label', async () => {
    mockEntries = [
      { day: '2026-10-18', weightKg: 80 },
      { day: '2026-10-10', weightKg: 80.5 },
    ];
    await renderUI(<WeightWidget size="small" />);
    expect(screen.getByText('-0.5 kg in 7 days')).toBeTruthy();
    await renderUI(<WeightWidget size="large" />);
    expect(screen.getByText('-0.5 kg this week')).toBeTruthy();
  });
});

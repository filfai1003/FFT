import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { renderUI } from '@/test/render';
import { useBodyViewStore } from './body-view-store';
import { HomeDayContext } from './home-day';
import { WeightWidget } from './WeightCard';

type Entry = { day: string; weightKg: number | null; bodyFatPct?: number | null };
let mockEntries: Entry[] = [];
let mockGoal = 'lose_fat';
let mockBodyGoal: { targetWeightKg: number | null; targetBodyFatPct: number | null } | null = null;
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/components/ui/TabBar', () => ({ useTabBarHeight: () => 80 }));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('@/features/profile/api', () => ({
  useProfile: () => ({ data: { goal: mockGoal, timezone: 'UTC' } }),
}));
jest.mock('@/features/progress/data', () => ({
  useBodyEntries: () => ({ data: mockEntries }),
  useBodyGoal: () => ({ data: mockBodyGoal }),
}));

// Six weeks of weigh-ins, oldest first (as the query returns them).
const weights: Entry[] = [
  { day: '2026-09-10', weightKg: 82 },
  { day: '2026-09-20', weightKg: 81.5 },
  { day: '2026-10-01', weightKg: 81 },
  { day: '2026-10-10', weightKg: 80.5 },
  { day: '2026-10-18', weightKg: 80 },
];

describe('Home · weight card', () => {
  beforeEach(() => {
    mockGoal = 'lose_fat';
    mockBodyGoal = null;
    mockPush.mockClear();
    useBodyViewStore.setState({ view: 'weight' });
    usePreferencesStore.setState({ weightUnit: 'kg' });
  });

  it('weight only: the number, the six-week line with its dates, the change and the goal', async () => {
    mockEntries = weights;
    mockBodyGoal = { targetWeightKg: 75, targetBodyFatPct: null };
    await renderUI(<WeightWidget size="large" />);
    expect(screen.getByText('80.0')).toBeTruthy();
    expect(screen.getByText('kg')).toBeTruthy();
    expect(screen.getByLabelText('Weekly average weight over the last 6 weeks')).toBeTruthy();
    expect(screen.getByText('6 Sep')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('2.0 kg')).toBeTruthy();
    expect(screen.getByText('Goal 75 kg')).toBeTruthy();
    // No body fat logged: no switch, and the whole card says the trend and opens Body.
    expect(screen.queryByRole('radio', { name: 'Body fat' })).toBeNull();
    const card = screen.getByRole('button', {
      name: 'Weight, 80.0 kg, down 2.0 kg in the last 6 weeks, Goal 75 kg',
    });
    await fireEvent.press(card);
    expect(mockPush).toHaveBeenCalledWith('/progress/body');
  });

  it("in the user's unit; half width keeps the line and its dates", async () => {
    mockEntries = weights;
    usePreferencesStore.setState({ weightUnit: 'lb' });
    await renderUI(<WeightWidget size="small" />);
    expect(screen.getByText('176.4')).toBeTruthy();
    expect(screen.getByText('lb')).toBeTruthy();
    expect(screen.getByText('4.4 lb')).toBeTruthy();
    expect(screen.getByLabelText('Weekly average weight over the last 6 weeks')).toBeTruthy();
  });

  it('weight and body fat: a switch shows the body fat line and is remembered', async () => {
    mockEntries = weights.map((e, i) => ({ ...e, bodyFatPct: [20, null, 19.5, 19, 18.8][i] }));
    mockBodyGoal = { targetWeightKg: null, targetBodyFatPct: 15 };
    await renderUI(<WeightWidget size="large" />);
    expect(screen.getByLabelText('Show weight or body fat')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Weight' })).toBeChecked();
    expect(screen.getByText('80.0')).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: 'Body fat' }));
    expect(useBodyViewStore.getState().view).toBe('bodyFat');
    expect(screen.getByText('18.8')).toBeTruthy();
    expect(screen.getByText('%')).toBeTruthy();
    expect(screen.getByText('1.2 points')).toBeTruthy();
    expect(screen.getByText('Goal 15 %')).toBeTruthy();
    expect(screen.getByLabelText('Weekly average body fat over the last 6 weeks')).toBeTruthy();
    // The body of the card is the button (the switch stays reachable on its own).
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Body fat, 18.8 %, down 1.2 points in the last 6 weeks, Goal 15 %',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith('/progress/body');

    // Shown again (the app reopened): still body fat; half width keeps the switch.
    await renderUI(<WeightWidget size="small" />);
    expect(screen.getByText('18.8')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Weight' })).toBeTruthy();
  });

  it('empty: the card unfilled, a dash for the number, and a tap logs the first weight', async () => {
    mockEntries = [];
    await renderUI(<WeightWidget size="large" />);
    expect(screen.getByText('–')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Body fat' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Log your weight' }));
    expect(mockPush).toHaveBeenCalledWith('/check-in');
  });

  it('one weigh-in: the number, where the line starts, and when it was logged', async () => {
    mockEntries = [{ day: '2026-10-18', weightKg: 80.4 }];
    await renderUI(<WeightWidget size="large" />);
    expect(screen.getByText('80.4')).toBeTruthy();
    expect(screen.getByText('Logged Sun 18 Oct')).toBeTruthy();
    expect(screen.queryByLabelText('Weekly average weight over the last 6 weeks')).toBeNull();
    await renderUI(<WeightWidget size="small" />);
    expect(screen.getByText('Logged Sun 18')).toBeTruthy();
  });

  it('says when the weight held steady', async () => {
    mockGoal = 'maintain';
    mockEntries = [
      { day: '2026-10-10', weightKg: 80.02 },
      { day: '2026-10-18', weightKg: 80 },
    ];
    await renderUI(<WeightWidget size="large" />);
    expect(screen.getByText('Steady')).toBeTruthy();
  });

  it('a past day: values up to that day, its date at the end of the line, no switch before body fat', async () => {
    mockEntries = [...weights.slice(0, 4), { day: '2026-10-17', weightKg: 79, bodyFatPct: 18 }];
    useBodyViewStore.setState({ view: 'bodyFat' });
    await renderUI(
      <HomeDayContext.Provider value="2026-10-14">
        <WeightWidget size="large" />
      </HomeDayContext.Provider>,
    );
    expect(screen.getByText('80.5')).toBeTruthy();
    expect(screen.queryByText('79.0')).toBeNull();
    expect(screen.getByText('14 Oct')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Body fat' })).toBeNull();
  });
});

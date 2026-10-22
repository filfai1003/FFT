import '@/i18n';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useAppearanceStore } from '@/design/appearance-store';
import { renderUI } from '@/test/render';
import { DaySummaryLine, Greeting } from './DayOverview';
import { SupplementsWidget, WaterGlass, WaterWidget } from './Widgets';

const mockSetTaken = jest.fn();
let mockTaken = new Set<string>();
let mockWaterMl = 0;
// The water target (DECISIONS 127): null = still being read (2 L), else the inputs.
let mockWaterInputs: Record<string, unknown> | null = null;
let mockWorkout: { kind: 'done' } | { kind: 'next'; name: string } | { kind: 'none' } = {
  kind: 'none',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: jest.fn(),
}));
jest.mock('@/components/ui/TabBar', () => ({ useTabBarHeight: () => 80 }));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-18' }));
jest.mock('@/features/supplements/data', () => ({
  useSupplements: () => ({
    data: [
      { id: 's1', name: 'Creatine', dose: '5 g' },
      { id: 's2', name: 'Vitamin D', dose: null },
      { id: 's3', name: 'Omega 3', dose: null },
    ],
  }),
  useSupplementLogs: () => ({ data: new Map([['2026-10-18', mockTaken]]) }),
  useSetTaken: () => ({ mutate: mockSetTaken }),
}));
jest.mock('@/features/supplements/SupplementsSheet', () => ({ SupplementsSheet: () => null }));
jest.mock('@/features/diet/log', () => ({
  useWater: () => ({
    data: { totalMl: mockWaterMl, rows: mockWaterMl ? [{ id: 'w', ml: mockWaterMl }] : [] },
  }),
  useAddWater: () => ({ mutate: jest.fn(), mutateAsync: jest.fn() }),
  useRemoveWater: () => ({ mutate: jest.fn() }),
  useDayTotals: () => ({ data: { kcal: 750, protein: 0, carbs: 0, fat: 0 } }),
  useDayLog: () => ({ data: [] }),
  useCopyEntries: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetLogDeleted: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/diet/water-target', () => ({
  useWaterTarget: () => ({
    target: mockWaterInputs
      ? jest.requireActual('@/domain/hydration').effectiveWaterTarget(null, mockWaterInputs)
      : null,
  }),
}));
jest.mock('./day-status', () => ({
  useTodayWorkout: () => ({ plan: null, rotation: null, upNext: undefined, doneToday: [] }),
  useDayStatus: () => ({
    eatenKcal: 750,
    targetKcal: 2400,
    workout: mockWorkout,
    waterMl: 1250,
    waterGoalMl: 2000,
    streak: 12,
    streakTarget: 14,
  }),
}));

beforeEach(() => {
  mockSetTaken.mockClear();
  mockTaken = new Set(['s1']);
  mockWaterMl = 0;
  mockWaterInputs = null;
  mockWorkout = { kind: 'none' };
  useAppearanceStore.setState({ reduceMotion: false });
});

describe('Home · supplements card', () => {
  it('says how many are taken, with a filled bar, and the pills tick', async () => {
    await renderUI(<SupplementsWidget size="large" />);
    expect(screen.getByLabelText('1 of 3 taken')).toBeTruthy();
    expect(screen.getByText('of 3 taken', { includeHiddenElements: true })).toBeTruthy();
    const vitamin = screen.getByRole('checkbox', { name: 'Vitamin D' });
    expect(vitamin.props.accessibilityState).toMatchObject({ checked: false });
    expect(
      screen.getByRole('checkbox', { name: 'Creatine · 5 g' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    await fireEvent.press(vitamin);
    expect(mockSetTaken).toHaveBeenCalledWith({
      day: '2026-10-18',
      supplementId: 's2',
      taken: true,
    });
  });

  it('has the same header as every card: tile and title', async () => {
    await renderUI(<SupplementsWidget size="small" />);
    expect(screen.getByRole('header', { name: 'Supplements' })).toBeTruthy();
  });
});

describe('Home · water glass', () => {
  it('fills to the amount drunk, with its value for screen readers', async () => {
    mockWaterMl = 1000;
    await renderUI(<WaterWidget size="small" />);
    expect(screen.getByLabelText('4 of 8 glasses')).toBeTruthy();
    expect(screen.getByText('1.0')).toBeTruthy();
    const level = screen.getByTestId('water-level', { includeHiddenElements: true });
    // Half of the 64 pt glass, plus the wave's amplitude above it.
    expect(level.props.style).toMatchObject({ height: 32 + 3 });
  });

  it('aims at the day’s target and explains it with the user’s own numbers', async () => {
    // 70 kg, 25, a man, trained today: 2.45 L + 0.5 L = 2.95 L, about 12 glasses of 250 ml.
    mockWaterInputs = { weightKg: 70, ageYears: 25, sex: 'male', trainedToday: true };
    mockWaterMl = 950;
    await renderUI(<WaterWidget size="large" />);
    expect(screen.getByLabelText('4 of 12 glasses')).toBeTruthy();
    expect(screen.getByText('2.0 L to go')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('About the water target'));
    expect(screen.getByText('Base: 70 kg × 35 ml = 2.45 L')).toBeTruthy();
    expect(screen.getByText('Training today: + 0.5 L')).toBeTruthy();
    expect(screen.getByText('Your target: 2.95 L')).toBeTruthy();
  });

  it('says the target is reached once the day’s amount is drunk', async () => {
    mockWaterInputs = { sex: 'female' }; // no weight: 1.6 L
    mockWaterMl = 1600;
    await renderUI(<WaterWidget size="small" />);
    expect(screen.getByText('Target reached')).toBeTruthy();
  });

  it('an empty glass has no water; reduce motion keeps the wave still', async () => {
    await renderUI(
      <WaterGlass share={0} width={40} height={64} accessibilityLabel="0 of 8 glasses" />,
    );
    expect(screen.queryByTestId('water-level', { includeHiddenElements: true })).toBeNull();
    await act(() => useAppearanceStore.setState({ reduceMotion: true }));
    await renderUI(
      <WaterGlass share={0.5} width={40} height={64} accessibilityLabel="4 of 8 glasses" />,
    );
    expect(screen.getByTestId('water-level', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('Home · greeting', () => {
  it('greets by first name with a summary line', async () => {
    mockWorkout = { kind: 'next', name: 'Workout B' };
    await renderUI(
      <>
        <Greeting name="Filippo Faiella" />
        <DaySummaryLine />
      </>,
    );
    expect(screen.getByRole('header').props.children).toMatch(
      /^Good (morning|afternoon|evening), Filippo$/,
    );
    expect(screen.getByText('Workout B today · 1,650 kcal left')).toBeTruthy();
  });
});

import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import type { BalanceRange, ExerciseMuscles, VolumeSet } from '@/domain/volume';
import { renderUI } from '@/test/render';
import { BalanceCard, BalanceScreen } from './BalanceScreens';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
}));

const MOCK_TODAY = '2026-10-21'; // a Wednesday
const mockMuscles: Record<string, ExerciseMuscles> = {
  bench: { primary: 'chest', secondary: ['front_delts', 'triceps'], indirect: [] },
  squat: {
    primary: 'quads',
    secondary: ['glutes', 'adductors'],
    indirect: ['hamstrings', 'lower_back'],
  },
};
const mockSets: { list: VolumeSet[] } = { list: [] };
const set = (exerciseId: string, day: string): VolumeSet => ({
  sessionId: day,
  exerciseId,
  day,
  dropIndex: 0,
  weightKg: 100,
  reps: 8,
});

// The real domain over fixture sets: only the database read is replaced.
jest.mock('./balance', () => ({
  useBalance: (range: BalanceRange) => {
    const { muscleBalance, mostBehind, behindList, withinCount, guidedCount } =
      jest.requireActual<typeof import('@/domain/volume')>('@/domain/volume');
    const rows = muscleBalance(
      mockSets.list,
      (id: string) => mockMuscles[id],
      range,
      MOCK_TODAY,
      'mon',
    );
    return {
      isPending: false,
      rows,
      behind: mostBehind(rows),
      behindList: behindList(rows),
      within: withinCount(rows),
      guided: guidedCount(rows),
      empty: rows.every((r) => r.sets === 0),
    };
  },
}));

describe('Training balance (DECISIONS 121, 125)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSets.list = [];
  });

  it('nothing trained: the card and the page say so, no bars to read', async () => {
    await renderUI(<BalanceCard />);
    expect(screen.getByText('No sets this week yet')).toBeTruthy();
    await renderUI(<BalanceScreen />);
    expect(screen.getAllByText('No sets this week yet').length).toBeGreaterThan(0);
    expect(screen.getByText('How sets are counted')).toBeTruthy();
  });

  it('the guideline has a "What\'s this?" explaining hard sets (DECISIONS 124)', async () => {
    await renderUI(<BalanceScreen />);
    await fireEvent.press(screen.getByLabelText('About hard sets'));
    expect(screen.getByText('Hard sets and the guideline')).toBeTruthy();
    expect(screen.getByText(/4 sets of bench press/)).toBeTruthy();
  });

  it('a week of training: weighted sets per muscle, by group, with the guideline in words', async () => {
    mockSets.list = [
      ...Array.from({ length: 12 }, () => set('bench', '2026-10-20')),
      ...Array.from({ length: 2 }, () => set('squat', '2026-10-19')),
    ];
    await renderUI(<BalanceScreen />);
    expect(
      screen.getByLabelText('Chest, 12 sets this week, within the 10 to 20 guideline'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Triceps, 6 sets this week, below the 10 to 20 guideline'),
    ).toBeTruthy();
    // Secondary muscles get half a set, indirect ones a quarter.
    expect(
      screen.getByLabelText('Glutes, 1 set this week, below the 10 to 20 guideline'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Hamstrings, 0.5 sets this week, below the 10 to 20 guideline'),
    ).toBeTruthy();
    // Helper muscles are shown without a guideline.
    expect(
      screen.getByLabelText(
        'Front shoulders, 6 sets this week, no guideline, it mostly works as a helper',
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Adductors (inner thighs), 1 set this week, no guideline, it mostly works as a helper',
      ),
    ).toBeTruthy();
    // The six groups of the filters; the status is a word, never colour alone.
    for (const g of ['Back', 'Shoulders', 'Arms', 'Legs', 'Core'])
      expect(screen.getByText(g)).toBeTruthy();
    expect(screen.getAllByText('Within', { includeHiddenElements: true }).length).toBe(1);
    expect(screen.getAllByText('No guideline', { includeHiddenElements: true }).length).toBe(5);
    // The muscle furthest behind (the first guided one with 0 sets in display order).
    expect(screen.getByText('Lats: 0 sets this week')).toBeTruthy();
    // Volume as a secondary figure, with thousands separators.
    expect(screen.getByText('9,600 kg volume', { includeHiddenElements: true })).toBeTruthy();
    // How much each muscle counts is explained once, on the first group.
    expect(screen.getByLabelText('About muscles worked')).toBeTruthy();
  });

  it('switches to last week and the 4-week average', async () => {
    mockSets.list = [
      ...Array.from({ length: 8 }, () => set('bench', '2026-10-13')),
      ...Array.from({ length: 8 }, () => set('bench', '2026-09-29')),
    ];
    await renderUI(<BalanceScreen />);
    expect(screen.getAllByText('No sets this week yet').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByText('Last week'));
    expect(
      screen.getByLabelText('Chest, 8 sets last week, below the 10 to 20 guideline'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('4-week avg'));
    expect(
      screen.getByLabelText('Chest, 4 sets a week on average, below the 10 to 20 guideline'),
    ).toBeTruthy();
  });

  it('the card counts the muscles within the guideline, shows the most behind and opens the page', async () => {
    mockSets.list = [
      ...Array.from({ length: 12 }, () => set('bench', '2026-10-20')),
      ...Array.from({ length: 2 }, () => set('squat', '2026-10-19')),
    ];
    await renderUI(<BalanceCard />);
    expect(screen.getByText('1 of 12')).toBeTruthy();
    expect(screen.getByText('Most behind')).toBeTruthy();
    // Four bars at most: the guided muscles with the fewest sets.
    expect(
      screen.getByLabelText('Lats, 0 sets this week, below the 10 to 20 guideline'),
    ).toBeTruthy();
    expect(screen.queryByText('Chest')).toBeNull();
    await fireEvent.press(
      screen.getByLabelText(
        'Training balance. 1 of 12 muscles within the guideline. Lats: 0 sets this week',
      ),
    );
    expect(mockPush).toHaveBeenCalledWith('/progress/balance');
  });
});

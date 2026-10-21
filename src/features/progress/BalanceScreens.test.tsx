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
  bench: { primary: 'chest', secondary: ['triceps', 'shoulders'] },
  squat: { primary: 'legs', secondary: ['glutes'] },
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
    const { muscleBalance, mostBehind, withinCount } =
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
      within: withinCount(rows),
      empty: rows.every((r) => r.sets === 0),
    };
  },
}));

describe('Training balance (DECISIONS 121)', () => {
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

  it('a week of training: sets per group with the guideline in words', async () => {
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
    expect(
      screen.getByLabelText('Glutes, 1 set this week, below the 10 to 20 guideline'),
    ).toBeTruthy();
    // Groups under push / pull / legs / core; the status is a word, never colour alone.
    expect(screen.getByText('Push')).toBeTruthy();
    expect(screen.getByText('Core')).toBeTruthy();
    expect(screen.getAllByText('Within', { includeHiddenElements: true }).length).toBe(1);
    // The group furthest behind (the first with 0 sets in display order).
    expect(screen.getByText('Back: 0 sets this week')).toBeTruthy();
    // Volume as a secondary figure, with thousands separators.
    expect(screen.getByText('9,600 kg volume', { includeHiddenElements: true })).toBeTruthy();
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

  it('the card counts the groups within the guideline and opens the page', async () => {
    mockSets.list = Array.from({ length: 12 }, () => set('bench', '2026-10-20'));
    await renderUI(<BalanceCard />);
    expect(screen.getByText('1 of 8')).toBeTruthy();
    expect(screen.getByText('Back: 0 sets this week')).toBeTruthy();
    await fireEvent.press(
      screen.getByLabelText(
        'Training balance. 1 of 8 muscle groups within the guideline. Back: 0 sets this week',
      ),
    );
    expect(mockPush).toHaveBeenCalledWith('/progress/balance');
  });
});

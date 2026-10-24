import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { useDayEditorStore } from './day-editor';
import { DayEditorScreen } from './DayEditorScreen';
import type { PlanView } from './plans';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({ dayId: 'd', planId: 'p' }),
  useNavigation: () => ({ getState: () => ({ routes: [] }) }),
}));

const names = ['Bench press', 'Curl', 'Pushdown', 'Squat', 'Lunge', 'Calf raise', 'Plank'];
// Bench alone, Curl + Pushdown (A), Squat + Lunge + Calf raise (B), Plank alone.
const links = [false, true, false, true, true, false, false];
const rests = [150, 60, 90, 120, 120, 120, 45];

const mockPlan: PlanView = {
  id: 'p',
  name: 'Full body',
  goal: null,
  status: 'active',
  source: 'manual',
  days: [
    {
      id: 'd',
      position: 0,
      name: 'Day A',
      exercises: names.map((name, i) => ({
        id: `pe${i}`,
        exerciseId: `x${i}`,
        position: i,
        targetSets: 3,
        targetReps: '10',
        restS: rests[i],
        notes: null,
        supersetWithNext: links[i],
        drops: null,
        exercise: {
          id: `x${i}`,
          ownerId: null,
          name,
          primaryMuscle: 'chest' as const,
          secondaryMuscles: [],
          indirectMuscles: [],
          equipment: 'barbell',
          logType: 'weight_reps' as const,
          imagePath: null,
        },
      })),
    },
  ],
};

jest.mock('./plans', () => ({
  ...jest.requireActual('./plans'),
  usePlan: () => ({ data: mockPlan }),
  useSaveDay: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteDay: () => ({ mutateAsync: jest.fn() }),
}));

const render = () =>
  renderUI(
    <QueryClientProvider client={new QueryClient()}>
      <DayEditorScreen />
    </QueryClientProvider>,
  );

beforeEach(() => useDayEditorStore.getState().set(null));

describe('day editor: a superset is one card (DECISIONS 129)', () => {
  it('two exercises in a superset share one card, split by one divider', async () => {
    await render();
    const cards = screen.getAllByTestId('superset-card');
    expect(cards).toHaveLength(2);
    const a = within(cards[0]);
    expect(a.getByText('Curl')).toBeTruthy();
    expect(a.getByText('Pushdown')).toBeTruthy();
    expect(a.getByText('Superset A')).toBeTruthy();
    expect(a.getAllByTestId('superset-divider', { includeHiddenElements: true })).toHaveLength(1);
    // The rest is said once, at the end of the card: not on each exercise.
    expect(a.getByText('Rest after each round')).toBeTruthy();
    expect(a.getByText('A1 · 3 × 10')).toBeTruthy();
    expect(a.getByText('A2 · 3 × 10')).toBeTruthy();
    expect(a.getByLabelText('About supersets')).toBeTruthy();
  });

  it('a superset of three: one card, two dividers', async () => {
    await render();
    const b = within(screen.getAllByTestId('superset-card')[1]);
    for (const name of ['Squat', 'Lunge', 'Calf raise']) expect(b.getByText(name)).toBeTruthy();
    expect(b.getAllByTestId('superset-divider', { includeHiddenElements: true })).toHaveLength(2);
    expect(b.getByText('Superset B')).toBeTruthy();
  });

  it('exercises outside a superset stay on their own, with their own rest', async () => {
    await render();
    for (const card of screen.getAllByTestId('superset-card')) {
      expect(within(card).queryByText('Bench press')).toBeNull();
      expect(within(card).queryByText('Plank')).toBeNull();
    }
    expect(screen.getByText('3 × 10 · Rest 2:30')).toBeTruthy();
    expect(screen.getByText('3 × 10 · Rest 0:45')).toBeTruthy();
  });

  it('screen readers hear the superset whole', async () => {
    await render();
    expect(screen.getByLabelText('Superset of 2: Curl, Pushdown')).toBeTruthy();
    expect(screen.getByLabelText('Superset of 3: Squat, Lunge, Calf raise')).toBeTruthy();
  });

  it('the round rest is set once for the whole superset', async () => {
    await render();
    const a = within(screen.getAllByTestId('superset-card')[0]);
    // Shows the last exercise's rest (the one after the round), 1:30.
    expect(a.getByText('1:30')).toBeTruthy();
    await fireEvent.press(a.getByLabelText('More rest'));
    const ex = useDayEditorStore.getState().state!.exercises;
    expect(ex[1].restS).toBe(105);
    expect(ex[2].restS).toBe(105);
    expect(ex[0].restS).toBe(150);
  });

  it('an open exercise keeps its controls inside the card, without its own rest', async () => {
    await render();
    await fireEvent.press(screen.getByLabelText('Curl'));
    const a = within(screen.getAllByTestId('superset-card')[0]);
    expect(a.getByLabelText('Remove Curl')).toBeTruthy();
    expect(a.getByLabelText('More sets')).toBeTruthy();
    expect(a.getByLabelText('Superset with the next exercise')).toBeTruthy();
    // Only the card's rest stepper: one "More rest" in the card.
    expect(a.getAllByLabelText('More rest')).toHaveLength(1);
    expect(a.getByLabelText('Move Curl')).toBeTruthy();
  });
});

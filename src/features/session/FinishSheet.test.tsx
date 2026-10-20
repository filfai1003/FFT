import { act, fireEvent, screen } from '@testing-library/react-native';
import '@/i18n';
import { renderUI } from '@/test/render';
import { FinishSheet } from './FinishSheet';
import { buildSession, toggleSet, type NewExercise } from './logic';
import { useSessionStore } from './store';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const exercise = (id: string, name: string): NewExercise => ({
  exerciseId: id,
  name,
  logType: 'weight_reps',
  imagePath: null,
  restS: 90,
  targetSets: 3,
  previous: [{ weightKg: 60, reps: 8, durationS: null, distanceM: null }],
});

function start() {
  const session = buildSession({
    planId: null,
    planDayId: null,
    dayName: 'Push',
    cycleNumber: null,
    outOfOrder: false,
    weightUnit: 'kg',
    now: new Date(),
    exercises: [exercise('a', 'Bench press'), exercise('b', 'Overhead press')],
  });
  useSessionStore.setState({ active: session });
  return session;
}

describe('Finish sheet', () => {
  afterEach(() => act(() => useSessionStore.setState({ active: null })));

  it('nothing done: one sentence and Discard first, no list of exercises', async () => {
    start();
    await renderUI(<FinishSheet visible onClose={() => undefined} />);
    expect(screen.getByText('No sets done yet')).toBeTruthy();
    expect(screen.queryByText('Not started')).toBeNull();
    expect(screen.queryByText('Bench press')).toBeNull();
    expect(screen.queryByText('Finish and save')).toBeNull();
    // Discarding still asks first.
    await fireEvent.press(screen.getByText('Discard workout'));
    expect(screen.getByText('Discard this workout?')).toBeTruthy();
    expect(useSessionStore.getState().active).not.toBeNull();
  });

  it('some sets done: the full list of what is left, with Finish and save', async () => {
    const s = start();
    await act(() => useSessionStore.setState({ active: toggleSet(s, 0, 0, new Date()).session }));
    await renderUI(<FinishSheet visible onClose={() => undefined} />);
    expect(screen.queryByText('No sets done yet')).toBeNull();
    expect(screen.getByText('Bench press')).toBeTruthy();
    expect(screen.getByText('1/3 sets')).toBeTruthy();
    expect(screen.getByText('Overhead press')).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
    expect(screen.getByText('Finish and save')).toBeTruthy();
    // Exercises done at a glance: 0 of 2 finished, in a training tile.
    expect(screen.getByText('0/2', { includeHiddenElements: true })).toBeTruthy();
  });
});

import { act, fireEvent, screen } from '@testing-library/react-native';
import '@/i18n';
import { color } from '@/design/tokens';
import { renderUI } from '@/test/render';
import { ActiveSessionBanner } from './ActiveSessionBanner';
import { buildSession, toggleSet, type NewExercise } from './logic';
import { SetRow, columnsFor } from './SetRow';
import { useSessionStore } from './store';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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
    dayName: 'Push A',
    cycleNumber: null,
    outOfOrder: false,
    weightUnit: 'kg',
    now: new Date(),
    exercises: [exercise('a', 'Bench press'), exercise('b', 'Overhead press')],
  });
  return toggleSet(session, 0, 0, new Date()).session;
}

describe('workout at a glance', () => {
  afterEach(() => act(() => useSessionStore.setState({ active: null })));

  it('the banner shows the day, the sets done as a bar and resumes on tap', async () => {
    const s = start();
    useSessionStore.setState({ active: s });
    await renderUI(<ActiveSessionBanner />);
    expect(screen.getByText('Push A')).toBeTruthy();
    expect(screen.getByText('1/6 sets')).toBeTruthy();
    expect(screen.getByLabelText('Sets done')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/^Resume Push A: 1 of 6 sets done, /));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session/[sessionId]',
      params: { sessionId: s.id },
    });
  });

  it('no workout, no banner', async () => {
    await renderUI(<ActiveSessionBanner />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the set the big button ticks is lit in training purple', async () => {
    const s = start();
    const props = {
      columns: columnsFor('weight_reps', 'kg'),
      large: false,
      onChange: () => undefined,
      onToggle: () => undefined,
    };
    await renderUI(<SetRow index={1} set={s.exercises[0].sets[1]} current {...props} />);
    expect(screen.getByTestId('current-set')).toHaveStyle({ backgroundColor: color.trainingSoft });
    await renderUI(<SetRow index={2} set={s.exercises[0].sets[2]} {...props} />);
    expect(screen.queryByTestId('current-set')).toBeNull();
  });
});

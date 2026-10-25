import { fireEvent, screen } from '@testing-library/react-native';
import '@/i18n';
import { color } from '@/design/tokens';
import { renderUI } from '@/test/render';
import type { SessionExercise } from './logic';
import { SuggestionCard } from './SuggestionCard';

const exercise = (suggestion: SessionExercise['suggestion']): SessionExercise => ({
  rowId: 'r',
  exerciseId: 'bench',
  name: 'Bench press',
  logType: 'weight_reps',
  imagePath: null,
  restS: 90,
  targetReps: '6-8',
  suggestion,
  sets: [],
});

describe('SuggestionCard', () => {
  it('shows the step up, why, and Keep with last time weight', async () => {
    const onKeep = jest.fn();
    await renderUI(
      <SuggestionCard
        exercise={exercise({
          kind: 'up',
          from: 80,
          to: 82.5,
          last: [
            { weight: 80, reps: 8 },
            { weight: 80, reps: 8 },
            { weight: 80, reps: 8 },
          ],
          reps: 6,
        })}
        unit="kg"
        onKeep={onKeep}
      />,
    );
    expect(screen.getByText('+2.5 kg: 82.5 kg × 6 on every set')).toBeTruthy();
    expect(screen.getByText('Last time 80 kg × 8, 8, 8: target reached')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Keep last time's weight, 80 kg"));
    expect(onKeep).toHaveBeenCalledWith(true);
  });

  it('a step up is a green panel; going down stays neutral, never red', async () => {
    const { unmount } = await renderUI(
      <SuggestionCard
        exercise={exercise({
          kind: 'up',
          from: 80,
          to: 82.5,
          last: [
            { weight: 80, reps: 8 },
            { weight: 80, reps: 8 },
            { weight: 80, reps: 8 },
          ],
          reps: 6,
        })}
        unit="kg"
        onKeep={() => undefined}
      />,
    );
    expect(screen.getByTestId('suggestion')).toHaveStyle({ backgroundColor: color.successSoft });
    await unmount();
    await renderUI(
      <SuggestionCard
        exercise={exercise({
          kind: 'down',
          from: 80,
          to: 75,
          last: [
            { weight: 80, reps: 5 },
            { weight: 80, reps: 4 },
          ],
          reps: 6,
        })}
        unit="kg"
        onKeep={() => undefined}
      />,
    );
    expect(screen.getByText('Down to 75 kg × 6 on every set')).toBeTruthy();
    expect(screen.getByTestId('suggestion')).toHaveStyle({ backgroundColor: color.surfaceAlt });
  });

  it('last time at two weights: listed by weight', async () => {
    await renderUI(
      <SuggestionCard
        exercise={exercise({
          kind: 'up',
          from: 105,
          to: 107.5,
          last: [
            { weight: 100, reps: 10 },
            { weight: 100, reps: 10 },
            { weight: 105, reps: 10 },
            { weight: 105, reps: 10 },
          ],
          reps: 8,
        })}
        unit="kg"
        onKeep={() => undefined}
      />,
    );
    expect(screen.getByText('+2.5 kg: 107.5 kg × 8 on every set')).toBeTruthy();
    expect(
      screen.getByText('Last time 100 kg × 10, 10 · 105 kg × 10, 10: target reached'),
    ).toBeTruthy();
  });

  it('same weight: no keep button, only the explanation (DECISIONS 124)', async () => {
    await renderUI(
      <SuggestionCard
        exercise={exercise({
          kind: 'same',
          from: 80,
          to: 80,
          last: [
            { weight: 80, reps: 8 },
            { weight: 80, reps: 7 },
          ],
          reps: 8,
        })}
        unit="kg"
        onKeep={() => undefined}
      />,
    );
    expect(screen.getByText('80 kg × 8 on every set')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('About the weight suggestion'));
    expect(screen.getByText('Next weight suggestion')).toBeTruthy();
    expect(screen.getByText(/progressive overload/)).toBeTruthy();
  });
});

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
        exercise={exercise({ kind: 'up', from: 80, to: 82.5, reps: [8, 8, 8] })}
        unit="kg"
        onKeep={onKeep}
      />,
    );
    expect(screen.getByText('+2.5 kg today')).toBeTruthy();
    expect(screen.getByText('Last time 80 kg × 8, 8, 8: target reached')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Keep last time's weight, 80 kg"));
    expect(onKeep).toHaveBeenCalledWith(true);
  });

  it('a step up is a green panel; going down stays neutral, never red', async () => {
    const { unmount } = await renderUI(
      <SuggestionCard
        exercise={exercise({ kind: 'up', from: 80, to: 82.5, reps: [8, 8, 8] })}
        unit="kg"
        onKeep={() => undefined}
      />,
    );
    expect(screen.getByTestId('suggestion')).toHaveStyle({ backgroundColor: color.successSoft });
    await unmount();
    await renderUI(
      <SuggestionCard
        exercise={exercise({ kind: 'down', from: 80, to: 75, reps: [5, 4] })}
        unit="kg"
        onKeep={() => undefined}
      />,
    );
    expect(screen.getByText('Go down to 75 kg today')).toBeTruthy();
    expect(screen.getByTestId('suggestion')).toHaveStyle({ backgroundColor: color.surfaceAlt });
  });

  it('same weight: no keep button, only the explanation (DECISIONS 124)', async () => {
    await renderUI(
      <SuggestionCard
        exercise={exercise({ kind: 'same', from: 80, to: 80, reps: [8, 7] })}
        unit="kg"
        onKeep={() => undefined}
      />,
    );
    expect(screen.getByText('Same weight, one more rep')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('About the weight suggestion'));
    expect(screen.getByText('Next weight suggestion')).toBeTruthy();
    expect(screen.getByText(/progressive overload/)).toBeTruthy();
  });
});

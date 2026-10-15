import { fireEvent, screen } from '@testing-library/react-native';
import '@/i18n';
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

  it('same weight: no button', async () => {
    await renderUI(
      <SuggestionCard
        exercise={exercise({ kind: 'same', from: 80, to: 80, reps: [8, 7] })}
        unit="kg"
        onKeep={() => undefined}
      />,
    );
    expect(screen.getByText('Same weight, one more rep')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

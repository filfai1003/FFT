import { fireEvent, screen } from '@testing-library/react-native';
import '@/i18n';
import { renderUI } from '@/test/render';
import { CycleBar, DayTile, ExerciseChips } from './CycleDay';

describe('cycle pieces', () => {
  it('a day tile says its state in words and opens on tap', async () => {
    const onPress = jest.fn();
    await renderUI(
      <DayTile
        day={{ id: 'a', n: 2, name: 'Pull', state: 'done', weekday: 'Thu', outOfOrder: false }}
        onPress={onPress}
      />,
    );
    expect(screen.getByText('Done Thu')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Pull, Done Thu'));
    expect(onPress).toHaveBeenCalled();
  });

  it('the next day shows its number and "Up next"', async () => {
    await renderUI(
      <DayTile
        day={{ id: 'a', n: 1, name: 'Push', state: 'next', weekday: null, outOfOrder: false }}
        onPress={() => undefined}
      />,
    );
    expect(screen.getByText('Up next')).toBeTruthy();
    expect(screen.getByText('1', { includeHiddenElements: true })).toBeTruthy();
  });

  it('the cycle bar reads as days done', async () => {
    await renderUI(<CycleBar cycle={2} done={1} total={4} />);
    expect(screen.getByLabelText('Cycle 2, 1 of 4 days done')).toBeTruthy();
  });

  it('exercise chips end with the count of the others', async () => {
    await renderUI(<ExerciseChips names={['Bench press', 'Dips']} more={3} />);
    expect(screen.getByText('Bench press')).toBeTruthy();
    expect(screen.getByText('+3 more')).toBeTruthy();
  });
});

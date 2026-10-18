import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { DaySummaryCard } from './DaySummaryCard';

const eaten = { kcal: 850, protein: 40, carbs: 90, fat: 30 };

describe('Diet day summary', () => {
  it('with a target: calories left and the target', async () => {
    await renderUI(
      <DaySummaryCard
        eaten={eaten}
        target={{ kcal: 2000, protein: 150, carbs: 200, fat: 60 }}
        caption="Target 2,000 kcal"
      />,
    );
    expect(screen.getByText('Left today')).toBeTruthy();
    expect(screen.getByText('1,150')).toBeTruthy();
  });

  it('no target (DECISIONS 104): what was eaten, no "left", and a way to set one', async () => {
    const onSetTarget = jest.fn();
    await renderUI(<DaySummaryCard eaten={eaten} target={null} onSetTarget={onSetTarget} />);
    expect(screen.queryByText('Left today')).toBeNull();
    expect(screen.getByText('Eaten')).toBeTruthy();
    expect(screen.getByText('850')).toBeTruthy();
    expect(screen.getByText('40 g')).toBeTruthy();
    await fireEvent.press(screen.getByText('Set a target'));
    expect(onSetTarget).toHaveBeenCalled();
  });
});

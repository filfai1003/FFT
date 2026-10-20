import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { DaySummaryCard } from './DaySummaryCard';

const eaten = { kcal: 850, protein: 40, carbs: 90, fat: 30 };
const target = { kcal: 2000, protein: 150, carbs: 200, fat: 60 };
const nothing = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

describe('Diet day summary (DECISIONS 112)', () => {
  it('with a target: calories left in the arc, grams left per macro, eaten · target', async () => {
    await renderUI(<DaySummaryCard eaten={eaten} target={target} caption="2 of 4 meals" />);
    expect(screen.getByText('1,150')).toBeTruthy();
    expect(screen.getByText('kcal left')).toBeTruthy();
    expect(screen.getByText('110 g left')).toBeTruthy();
    expect(screen.getByText('850 eaten · target 2,000')).toBeTruthy();
    expect(screen.getByText('2 of 4 meals')).toBeTruthy();
    expect(screen.getByLabelText('850 of 2000 kilocalories eaten. 1,150 kcal left')).toBeTruthy();
  });

  it('over the target: says how much over instead of a flat 0 left', async () => {
    await renderUI(
      <DaySummaryCard eaten={{ kcal: 2400, protein: 160, carbs: 250, fat: 70 }} target={target} />,
    );
    expect(screen.getByText('400')).toBeTruthy();
    expect(screen.getByText('kcal over')).toBeTruthy();
    expect(screen.getAllByText('10 g over')).toHaveLength(2);
    expect(screen.getByText('50 g over')).toBeTruthy();
  });

  it('nothing logged: the same card, unfilled (the whole target left)', async () => {
    await renderUI(<DaySummaryCard eaten={nothing} target={target} />);
    expect(screen.getByText('2,000')).toBeTruthy();
    expect(screen.getByText('150 g left')).toBeTruthy();
  });

  it('no target (DECISIONS 104): what was eaten, its macro split, and a way to set one', async () => {
    const onSetTarget = jest.fn();
    await renderUI(<DaySummaryCard eaten={eaten} target={null} onSetTarget={onSetTarget} />);
    expect(screen.queryByText('kcal left')).toBeNull();
    expect(screen.getByText('Eaten')).toBeTruthy();
    expect(screen.getByText('850')).toBeTruthy();
    expect(screen.getByText('40 g')).toBeTruthy();
    expect(screen.getByLabelText('Calories from protein 20%, carbs 46%, fat 34%')).toBeTruthy();
    await fireEvent.press(screen.getByText('Set a target'));
    expect(onSetTarget).toHaveBeenCalled();
  });

  it('while the totals load: a placeholder, never a 0', async () => {
    await renderUI(<DaySummaryCard eaten={nothing} target={target} loading />);
    expect(screen.queryByText('2,000')).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { renderUI } from '@/test/render';
import { Input } from './Input';
import { Stepper } from './Stepper';

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('Input', () => {
  it('uses the label as accessible name and keeps text >= 16px', async () => {
    const onChangeText = jest.fn();
    await renderUI(<Input label="Day name" value="Push A" onChangeText={onChangeText} />);
    const input = screen.getByLabelText('Day name');
    expect(flat(input.props.style).fontSize).toBeGreaterThanOrEqual(16);
    await fireEvent.changeText(input, 'Pull A');
    expect(onChangeText).toHaveBeenCalledWith('Pull A');
  });

  it('shows an error message', async () => {
    await renderUI(<Input label="Name" value="" onChangeText={jest.fn()} error="Required" />);
    expect(screen.getByText('Required')).toBeTruthy();
  });
});

function Harness({
  initial = 4,
  min = 1,
  max = 10,
}: {
  initial?: number;
  min?: number;
  max?: number;
}) {
  const [v, setV] = useState(initial);
  return (
    <Stepper
      value={v}
      onChange={setV}
      min={min}
      max={max}
      decreaseLabel="Fewer sets"
      increaseLabel="More sets"
    />
  );
}

describe('Stepper', () => {
  it('increments and decrements within bounds', async () => {
    await renderUI(<Harness initial={2} min={1} max={3} />);
    await fireEvent.press(screen.getByRole('button', { name: 'More sets' }));
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More sets' }).props.accessibilityState).toEqual({
      disabled: true,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Fewer sets' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Fewer sets' }));
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fewer sets' }).props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  it('amount variant commits typed values, clamped, and ignores junk', async () => {
    const onChange = jest.fn();
    await renderUI(
      <Stepper
        variant="amount"
        value={150}
        onChange={onChange}
        min={1}
        max={2000}
        unit="g"
        valueLabel="Amount in grams"
        decreaseLabel="Decrease portion"
        increaseLabel="Increase portion"
      />,
    );
    const input = screen.getByLabelText('Amount in grams');
    await fireEvent.changeText(input, '5000');
    await fireEvent(input, 'endEditing');
    expect(onChange).toHaveBeenCalledWith(2000);
    onChange.mockClear();
    await fireEvent.changeText(input, 'abc');
    await fireEvent(input, 'endEditing');
    expect(onChange).not.toHaveBeenCalled();
  });
});

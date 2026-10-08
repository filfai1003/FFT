import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { Button } from './Button';
import { Chip } from './Chip';
import { IconButton } from './IconButton';
import { Segmented } from './Segmented';
import { Toggle } from './Toggle';

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('Button', () => {
  it('fires onPress and exposes its label', async () => {
    const onPress = jest.fn();
    await renderUI(<Button label="Save day" onPress={onPress} size="large" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save day' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is 56px high when large and never below 44px', async () => {
    await renderUI(<Button label="Save day" onPress={jest.fn()} size="large" />);
    const style = flat(screen.getByRole('button').props.style);
    expect(style.height).toBe(56);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    await renderUI(<Button label="Save" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('is labelled and at least 44x44 even if a smaller size is asked', async () => {
    await renderUI(
      <IconButton icon="bell" accessibilityLabel="Notifications" onPress={jest.fn()} size={30} />,
    );
    const style = flat(screen.getByRole('button', { name: 'Notifications' }).props.style);
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
  });
});

describe('Chip', () => {
  it('reports its selected state and toggles', async () => {
    const onPress = jest.fn();
    await renderUI(<Chip label="Chest" selected onPress={onPress} />);
    const chip = screen.getByRole('checkbox', { name: 'Chest' });
    expect(chip.props.accessibilityState).toEqual({ checked: true });
    expect(flat(chip.props.style).height).toBe(44);
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalled();
  });
});

describe('Segmented', () => {
  const options = [
    { value: '4w', label: '4 WK' },
    { value: '12w', label: '12 WK' },
  ] as const;

  it('marks the current option and calls onChange for another one only', async () => {
    const onChange = jest.fn();
    await renderUI(
      <Segmented options={options} value="12w" onChange={onChange} accessibilityLabel="Range" />,
    );
    expect(screen.getByRole('radio', { name: '12 WK' }).props.accessibilityState).toEqual({
      checked: true,
    });
    await fireEvent.press(screen.getByRole('radio', { name: '12 WK' }));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('radio', { name: '4 WK' }));
    expect(onChange).toHaveBeenCalledWith('4w');
  });
});

describe('Toggle', () => {
  it('flips the value and has a 44px touch area', async () => {
    const onValueChange = jest.fn();
    await renderUI(
      <Toggle value={false} onValueChange={onValueChange} accessibilityLabel="Bold" />,
    );
    const toggle = screen.getByRole('switch', { name: 'Bold' });
    expect(toggle.props.accessibilityState).toEqual({ checked: false });
    await fireEvent.press(toggle);
    expect(onValueChange).toHaveBeenCalledWith(true);
    // 26px visual + hit slop above and below must reach 44px
    const slop = toggle.props.hitSlop as { top: number; bottom: number };
    expect(26 + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
  });
});

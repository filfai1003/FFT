import '@/i18n';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useAppearanceStore } from '@/design/appearance-store';
import { palettes } from '@/design/tokens';
import { useToastStore } from '@/lib/toast-store';
import { renderUI } from '@/test/render';
import { Button } from './Button';
import { CardTitle } from './CardTitle';
import { Chip } from './Chip';
import { Input } from './Input';
import { MenuList } from './MenuList';
import { ToastHost } from './ToastHost';
import { Toggle } from './Toggle';
import { ToggleRow } from './ToggleRow';

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

afterEach(() => useAppearanceStore.setState({ reduceMotion: false }));

describe('Toggle', () => {
  it('can be disabled: announced, faded and not changed', async () => {
    const onValueChange = jest.fn();
    await renderUI(
      <Toggle value onValueChange={onValueChange} accessibilityLabel="Sync" disabled />,
    );
    const toggle = screen.getByRole('switch', { name: 'Sync' });
    expect(toggle.props.accessibilityState).toEqual({ checked: true, disabled: true });
    await fireEvent.press(toggle);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('draws its knob with theme colours only', async () => {
    await renderUI(<Toggle value={false} onValueChange={jest.fn()} accessibilityLabel="Off" />);
    const knob = screen.getByTestId('toggle-knob', { includeHiddenElements: true });
    expect(flat(knob.props.style).backgroundColor).toBe(palettes.light.surface);
  });
});

describe('ToggleRow', () => {
  it('is one switch for the whole row, with the help line as hint', async () => {
    const onValueChange = jest.fn();
    await renderUI(
      <ToggleRow
        name="Reduce motion"
        detail="No animations"
        value={false}
        onValueChange={onValueChange}
        icon="eye"
      />,
    );
    const row = screen.getByRole('switch', { name: 'Reduce motion' });
    expect(row.props.accessibilityHint).toBe('No animations');
    expect(flat(row.props.style).minHeight).toBeGreaterThanOrEqual(56);
    await fireEvent.press(row);
    expect(onValueChange).toHaveBeenCalledWith(true);
    // Only one switch: the drawn track is not a second control.
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('does nothing when disabled', async () => {
    const onValueChange = jest.fn();
    await renderUI(<ToggleRow name="Copy" value onValueChange={onValueChange} disabled />);
    await fireEvent.press(screen.getByRole('switch', { name: 'Copy' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('Button loading', () => {
  it('shows a spinner, is busy and cannot be pressed twice', async () => {
    const onPress = jest.fn();
    await renderUI(<Button label="Sign in" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.getByTestId('button-busy')).toBeTruthy();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows no spinning wheel with reduce motion', async () => {
    useAppearanceStore.setState({ reduceMotion: true });
    await renderUI(<Button label="Export" onPress={jest.fn()} loading />);
    expect(screen.queryByTestId('button-busy')).toBeNull();
  });
});

describe('Chip', () => {
  it('a selected multi-choice chip shows a check, a radio chip does not', async () => {
    await renderUI(
      <>
        <Chip label="Chest" selected onPress={jest.fn()} />
        <Chip label="kg" selected role="radio" onPress={jest.fn()} />
        <Chip label="Back" selected={false} onPress={jest.fn()} />
      </>,
    );
    expect(screen.getAllByTestId('chip-check', { includeHiddenElements: true })).toHaveLength(1);
    expect(flat(screen.getByRole('radio', { name: 'kg' }).props.style).height).toBe(44);
  });
});

describe('Input password', () => {
  it('shows and hides what was typed with the eye button', async () => {
    await renderUI(
      <Input label="Password" secureTextEntry value="secret" onChangeText={jest.fn()} />,
    );
    const field = screen.getByLabelText('Password');
    expect(field.props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });

  it('reveal={false} keeps the field hidden without a button', async () => {
    await renderUI(<Input label="PIN" secureTextEntry reveal={false} />);
    expect(screen.queryByRole('button', { name: 'Show password' })).toBeNull();
  });
});

describe('CardTitle and MenuList', () => {
  it('the card title is a header', async () => {
    await renderUI(<CardTitle icon="shield" title="Policies" />);
    expect(screen.getByRole('header', { name: 'Policies' })).toBeTruthy();
  });

  it('a menu row tile takes its area colour', async () => {
    const view = await renderUI(
      <MenuList
        items={[{ icon: 'bowl', area: 'nutrition', label: 'Goals', onPress: jest.fn() }]}
      />,
    );
    expect(JSON.stringify(view.toJSON())).toContain(palettes.light.nutritionSoft);
  });
});

describe('Toast time left', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useToastStore.setState({ toast: null });
  });
  afterEach(() => jest.useRealTimers());

  it('an undo toast shows the time left; a plain one does not', async () => {
    await renderUI(<ToastHost />);
    await act(async () => {
      useToastStore.getState().show({ message: 'Saved', actionLabel: 'Undo', onAction: jest.fn() });
    });
    expect(screen.getByTestId('toast-time-left', { includeHiddenElements: true })).toBeTruthy();
    await act(async () => {
      useToastStore.getState().show({ message: 'Imported' });
    });
    expect(screen.queryByTestId('toast-time-left', { includeHiddenElements: true })).toBeNull();
  });
});

import { act, fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { TOAST_DURATION_MS, useToastStore } from '@/lib/toast-store';
import { renderUI } from '@/test/render';
import { Sheet } from './Sheet';
import { ToastHost } from './ToastHost';

beforeEach(() => {
  jest.useFakeTimers();
  useToastStore.setState({ toast: null });
});
afterEach(() => jest.useRealTimers());

describe('Toast', () => {
  it('shows a message with UNDO and runs the action once', async () => {
    const undo = jest.fn();
    await renderUI(<ToastHost />);
    await act(async () => {
      useToastStore
        .getState()
        .show({ message: 'Set 2 saved', actionLabel: 'Undo', onAction: undo });
    });
    expect(screen.getByText('Set 2 saved')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Set 2 saved')).toBeNull();
  });

  it('disappears after 5 seconds without running the action', async () => {
    const undo = jest.fn();
    await renderUI(<ToastHost />);
    await act(async () => {
      useToastStore.getState().show({ message: 'Meal done', actionLabel: 'Undo', onAction: undo });
    });
    await act(async () => {
      jest.advanceTimersByTime(TOAST_DURATION_MS - 100);
    });
    expect(screen.getByText('Meal done')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Meal done')).toBeNull();
    expect(undo).not.toHaveBeenCalled();
  });

  it('a new toast replaces the previous one and its timer', async () => {
    await renderUI(<ToastHost />);
    await act(async () => {
      useToastStore.getState().show({ message: 'First' });
    });
    await act(async () => {
      jest.advanceTimersByTime(4000);
      useToastStore.getState().show({ message: 'Second' });
    });
    await act(async () => {
      jest.advanceTimersByTime(2000); // first timer would have fired by now
    });
    expect(screen.getByText('Second')).toBeTruthy();
    expect(screen.queryByText('First')).toBeNull();
  });

  it('the action button is at least 44x44', async () => {
    await renderUI(<ToastHost />);
    await act(async () => {
      useToastStore.getState().show({ message: 'x', actionLabel: 'Undo' });
    });
    const style = JSON.stringify(screen.getByRole('button', { name: 'Undo' }).props.style);
    expect(style).toContain('"minWidth":44');
    expect(style).toContain('"minHeight":44');
  });
});

describe('Sheet', () => {
  it('renders title and content when visible, and closes from the close button', async () => {
    const onClose = jest.fn();
    await renderUI(
      <Sheet visible onClose={onClose} title="Adjust a meal" closeLabel="Close">
        <Text>body</Text>
      </Sheet>,
    );
    expect(screen.getByText('Adjust a meal')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when not visible', async () => {
    await renderUI(
      <Sheet visible={false} onClose={jest.fn()} title="Hidden" closeLabel="Close">
        <Text>body</Text>
      </Sheet>,
    );
    expect(screen.queryByText('Hidden')).toBeNull();
  });
});

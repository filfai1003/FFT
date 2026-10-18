import { act, fireEvent, screen } from '@testing-library/react-native';
import { palettes } from '@/design/tokens';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { renderUI } from '@/test/render';
import { EmptyState } from './EmptyState';

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('EmptyState', () => {
  afterEach(async () => {
    await act(async () => usePreferencesStore.setState({ theme: 'light' }));
  });

  it('shows a title (as a heading), one line and both actions', async () => {
    const create = jest.fn();
    const empty = jest.fn();
    await renderUI(
      <EmptyState
        icon="dumbbell"
        area="training"
        title="No plan yet"
        body="A plan tells you what to train next."
        action={{ label: 'Create a plan', onPress: create }}
        actionVariant="primary"
        secondaryAction={{ label: 'Empty workout', onPress: empty }}
      />,
    );
    expect(screen.getByRole('header', { name: 'No plan yet' })).toBeTruthy();
    expect(screen.getByText('A plan tells you what to train next.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Create a plan' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Empty workout' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(empty).toHaveBeenCalledTimes(1);
  });

  it('the action is outlined unless the screen makes it its one accent', async () => {
    await renderUI(
      <EmptyState
        icon="users"
        title="No friends yet"
        action={{ label: 'Add', onPress: jest.fn() }}
      />,
    );
    const style = flat(screen.getByRole('button', { name: 'Add' }).props.style);
    expect(style.backgroundColor).toBe(palettes.light.surface);
    expect(style.borderWidth).toBe(1);
  });

  it('draws the card and its tile from the dark palette in the dark theme', async () => {
    await act(async () => usePreferencesStore.setState({ theme: 'dark' }));
    const view = await renderUI(<EmptyState icon="camera" area="training" title="No photos yet" />);
    const json = JSON.stringify(view.toJSON());
    expect(json).toContain(palettes.dark.surface);
    expect(json).toContain(palettes.dark.trainingSoft);
    expect(json).not.toContain(palettes.light.trainingSoft);
  });

  it('without a card: only the content, for a card the screen already has', async () => {
    const view = await renderUI(<EmptyState card={false} compact icon="chart" title="Nothing" />);
    expect(JSON.stringify(view.toJSON())).not.toContain(palettes.light.borderDecorative);
  });
});

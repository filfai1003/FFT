import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import '@/i18n';
import { useSessionStore } from '@/features/auth/session-store';
import { usePlanStore } from '@/lib/plan';
import { renderUI } from '@/test/render';
import { ServerCopyCard, SyncChoiceScreen, SyncNeededCard } from './ServerCopy';

const mockTurnOn = jest.fn(async () => undefined);
const mockTurnOff = jest.fn(async () => undefined);
jest.mock('./sync', () => ({
  turnSyncOn: () => mockTurnOn(),
  turnSyncOff: () => mockTurnOff(),
}));
jest.mock('@/features/auth/api', () => ({ signOut: jest.fn() }));

const U = '11111111-2222-4333-8444-555555555555';
const queryClient = new QueryClient();
const withQuery = (ui: React.ReactElement) =>
  renderUI(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

beforeEach(() => {
  useSessionStore.setState({ status: 'signedIn', session: null, userId: U });
  mockTurnOn.mockClear();
  mockTurnOff.mockClear();
});

describe('keep a copy on the server', () => {
  it('a new account chooses: nothing is preselected, Continue waits for a choice', async () => {
    const onDone = jest.fn();
    await withQuery(<SyncChoiceScreen onDone={onDone} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    for (const r of radios) expect(r.props.accessibilityState).toEqual({ checked: false });
    expect(screen.getByText(/stored on our server in the EU/)).toBeTruthy();
    const next = screen.getByRole('button', { name: 'Continue' });
    await fireEvent.press(next);
    expect(mockTurnOn).not.toHaveBeenCalled();
    expect(mockTurnOff).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('radio', { name: /^Only on this phone/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockTurnOff).toHaveBeenCalled();
    expect(mockTurnOn).not.toHaveBeenCalled();
  });

  it('turning it off asks first and says it cannot be undone', async () => {
    usePlanStore.setState({ userId: U, plan: 'free', sync: 'on', home: 'online' });
    await withQuery(<ServerCopyCard />);
    await fireEvent.press(screen.getByRole('switch', { name: 'Keep a copy on the server' }));
    expect(mockTurnOff).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot be undone/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Turn off and delete the copy' }));
    await waitFor(() => expect(mockTurnOff).toHaveBeenCalled());
  });

  it('where AI apps need it: explained and offered when off, hidden when on', async () => {
    usePlanStore.setState({ userId: U, plan: 'free', sync: 'off', home: 'device' });
    const view = await withQuery(<SyncNeededCard />);
    expect(screen.getByText('AI apps need the copy on the server')).toBeTruthy();
    await view.unmount();
    usePlanStore.setState({ userId: U, plan: 'free', sync: 'on', home: 'online' });
    await withQuery(<SyncNeededCard />);
    expect(screen.queryByText('AI apps need the copy on the server')).toBeNull();
  });
});

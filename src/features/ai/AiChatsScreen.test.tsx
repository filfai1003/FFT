import '@/i18n';
import { act, screen } from '@testing-library/react-native';
import { useSessionStore } from '@/features/auth/session-store';
import { renderUI } from '@/test/render';
import { useConversations } from './agent/conversations';
import { AiChatsScreen } from './AiChatsScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
let mockHydrated = true;
jest.mock('./agent/conversations', () => ({
  ...jest.requireActual('./agent/conversations'),
  useConversationsHydrated: () => mockHydrated,
}));

describe('AI chats list', () => {
  beforeEach(async () => {
    mockHydrated = true;
    await act(async () => {
      useSessionStore.setState({ userId: 'u1' });
      useConversations.setState({ conversations: {} });
    });
  });

  it('with no conversation: an empty state that says what to ask', async () => {
    await renderUI(<AiChatsScreen />);
    expect(screen.getByRole('header', { name: 'No conversations yet' })).toBeTruthy();
    expect(screen.getByText(/Ask the coach about your training/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New chat' })).toBeTruthy();
  });

  it('while the saved chats are read back: placeholders, not "No conversations yet"', async () => {
    mockHydrated = false;
    await renderUI(<AiChatsScreen />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'No conversations yet' })).toBeNull();
  });

  it('lists the saved conversations instead', async () => {
    await act(async () => {
      useConversations.getState().create('u1');
    });
    await renderUI(<AiChatsScreen />);
    expect(screen.queryByRole('header', { name: 'No conversations yet' })).toBeNull();
    expect(screen.getByRole('button', { name: 'New conversation' })).toBeTruthy();
  });
});

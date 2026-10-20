import i18n from '@/i18n';
import { act, screen } from '@testing-library/react-native';
import { useSessionStore } from '@/features/auth/session-store';
import { renderUI } from '@/test/render';
import { useConversations } from './agent/conversations';
import { AiChatsScreen, whenLabel } from './AiChatsScreen';

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
    // Read with when it was used and how long it is (DECISIONS 115).
    expect(screen.getByRole('button', { name: /^New conversation, Today · / })).toBeTruthy();
  });

  it('says when a chat was used in words for the last week, then the date', () => {
    const now = new Date(2026, 9, 20, 12);
    const t = i18n.t.bind(i18n);
    expect(whenLabel(t, new Date(2026, 9, 20, 8).toISOString(), now)).toBe('Today');
    expect(whenLabel(t, new Date(2026, 9, 19, 23).toISOString(), now)).toBe('Yesterday');
    expect(whenLabel(t, new Date(2026, 9, 16, 9).toISOString(), now)).toBe('4 days ago');
    expect(whenLabel(t, new Date(2026, 8, 30, 9).toISOString(), now)).toBe('Sep 30');
  });
});

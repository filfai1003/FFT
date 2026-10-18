import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { useToastStore } from '@/lib/toast-store';
import { renderUI } from '@/test/render';
import { CommunityView, formatScore } from './CommunityView';
import { PublicProfileScreen } from './PublicProfileScreen';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useNavigation: () => ({ getState: () => ({ routes: [] }) }),
}));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-14' }));
jest.mock('@/features/profile/api', () => ({
  useProfile: () => ({ data: { name: 'Filippo' } }),
  useUpdateProfile: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/features/train/exercises', () => ({ useExercises: () => ({ data: [] }) }));
jest.mock('@/features/gamification/data', () => ({ useGamification: () => null }));

const mockState: { member: boolean } = { member: false };
const mockJoin = jest.fn(async () => undefined);
const mockLeave = jest.fn(async () => undefined);
const mockSubmit = jest.fn(async () => undefined);
const mutation = (fn: (...a: unknown[]) => Promise<unknown> = jest.fn(async () => 'asked')) => ({
  mutate: jest.fn(),
  mutateAsync: fn,
  isPending: false,
});
jest.mock('./api', () => {
  const me = {
    public_id: 'p-me',
    name: 'Filippo',
    invite_code: 'ABCD2345',
    level: 7,
    badges: ['first_workout'],
    joined_at: '2026-09-02T10:00:00Z',
    submitted_at: null,
  };
  const rows = [
    { public_id: 'p1', name: 'Noor', level: 9, value: 12, place: 1, place_before: 1, is_me: false },
    { public_id: 'p2', name: 'Bea', level: 4, value: 10, place: 2, place_before: 3, is_me: false },
    { public_id: 'p3', name: 'Jonas', level: 5, value: 9, place: 3, place_before: 2, is_me: false },
    { public_id: 'p4', name: 'Kenji', level: 5, value: 8, place: 4, place_before: 6, is_me: false },
    {
      public_id: 'p-me',
      name: 'Filippo',
      level: 7,
      value: 3,
      place: 12,
      place_before: 15,
      is_me: true,
    },
  ];
  return {
    periodStartOf: (p: string) => (p === 'week' ? '2026-10-12' : '2026-10-01'),
    useCommunityAvailable: () => true,
    useCommunityMe: () => ({
      isPending: false,
      isError: false,
      data: mockState.member ? me : null,
    }),
    useBoard: () => ({ isPending: false, isError: false, data: { total: 40, rows } }),
    useFriends: () => ({
      data: [{ public_id: 'p9', name: 'Marta', level: 3, status: 'asked_you', value: null }],
    }),
    usePublicProfile: () => ({
      isError: false,
      data: {
        ...me,
        is_me: true,
        friend: null,
        scores: [
          { period: 'month', metric: 'workouts', value: 3, place: 12, total: 40, top_pct: 30 },
          { period: 'week', metric: 'diet', value: 80, place: 2, total: 40, top_pct: 5 },
        ],
      },
    }),
    useCommunitySubmit: () => mockSubmit,
    useJoinCommunity: () => mutation(mockJoin),
    useLeaveCommunity: () => mutation(mockLeave),
    useSetCommunityName: () => mutation(),
    useAddFriend: () => mutation(),
    useAnswerFriend: () => mutation(),
    useRemoveFriend: () => mutation(),
  };
});

beforeEach(() => {
  mockPush.mockClear();
  mockJoin.mockClear();
  mockLeave.mockClear();
});

describe('Community: join', () => {
  it('shows what is shared and never shared, and joins with the profile name', async () => {
    mockState.member = false;
    await renderUI(<CommunityView />);
    expect(screen.getByText('Join the community')).toBeTruthy();
    expect(screen.getByText('Your scores')).toBeTruthy();
    expect(screen.getByText('Weight')).toBeTruthy();
    expect(screen.getByText('Photos')).toBeTruthy();
    expect(screen.getByLabelText('Change your name')).toBeTruthy();
    await fireEvent.press(screen.getByText('Join'));
    expect(mockJoin).toHaveBeenCalledWith('Filippo');
  });
});

describe('Community: leaderboard', () => {
  it('podium, places with movement words, friend requests and your place', async () => {
    mockState.member = true;
    // Your place is part of the board now (DECISIONS 107), at the top.
    await renderUI(<CommunityView />);
    expect(screen.getByText('Most workouts')).toBeTruthy();
    expect(screen.getByLabelText('1: Noor, 12')).toBeTruthy();
    expect(screen.getByLabelText('4. Kenji, 8, Up 2')).toBeTruthy();
    expect(screen.getByText('Wants to be your friend')).toBeTruthy();
    expect(screen.getByLabelText('Accept Marta')).toBeTruthy();
    expect(
      screen.getByLabelText('Your place: 12 of 40, Up 3 places since yesterday, 3'),
    ).toBeTruthy();
    expect(screen.getByText('You · top 30%')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('1: Noor, 12'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/progress/community-profile',
      params: { id: 'p1' },
    });
  });

  it('the filters: Everyone is free, the others carry Supporter and lead to it', async () => {
    mockState.member = true;
    await renderUI(<CommunityView />);
    await fireEvent.press(screen.getByLabelText('Who you compare with: Everyone. Change'));
    expect(screen.getByText('Compare with')).toBeTruthy();
    expect(screen.getAllByText('Supporter').length).toBe(3);
    await fireEvent.press(screen.getByLabelText('Friends. Supporter, coming soon'));
    expect(mockPush).toHaveBeenCalledWith('/profile/premium');
  });

  it('scores read as counts and signed percentages', () => {
    expect(formatScore('workouts', 12)).toBe('12');
    expect(formatScore('diet', 82.5)).toBe('82.5%');
    expect(formatScore('strength', 3.5)).toBe('+3.5%');
    expect(formatScore('strength', -1)).toBe('−1%');
  });
});

describe('Community profile', () => {
  it('your own page: how others see you, places, then leave with confirmation and undo', async () => {
    mockState.member = true;
    await renderUI(<PublicProfileScreen />);
    expect(screen.getByText('This is how others see you')).toBeTruthy();
    expect(screen.getByText('Filippo')).toBeTruthy();
    expect(screen.getByLabelText('Top 5%, Days on target, This week · place 2 of 40')).toBeTruthy();
    expect(screen.getByText('My code')).toBeTruthy();
    await fireEvent.press(screen.getByText('Leave the community'));
    expect(screen.getByText('Leave the community?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Leave'));
    expect(mockLeave).toHaveBeenCalled();
    const toast = useToastStore.getState().toast;
    expect(toast?.message).toBe('You left the community');
    expect(toast?.actionLabel).toBe('Undo');
    await toast?.onAction?.();
    expect(mockJoin).toHaveBeenCalledWith('Filippo');
  });
});

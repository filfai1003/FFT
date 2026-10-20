import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { usePlanStore } from '@/lib/plan';
import { useToastStore } from '@/lib/toast-store';
import { renderUI } from '@/test/render';
import { useBoardChoice } from './board-store';
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
const mockBoardKeys: { audience: string }[] = [];
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
    useBoard: (key: { audience: string }) => {
      mockBoardKeys.push(key);
      return {
        isPending: false,
        isError: false,
        data:
          key.audience === 'country'
            ? { audience: 'country', total: 0, rows: [], reason: 'no_country' }
            : key.audience === 'class'
              ? { audience: 'class', total: 2, rows, age_group: '25-34', weight_class: 'm83' }
              : { total: 40, rows },
      };
    },
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
  mockBoardKeys.length = 0;
  useBoardChoice.setState({ audience: 'everyone', period: 'month' });
  usePlanStore.setState({ plan: null });
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

  it('free: Everyone works, the other audiences carry Supporter and open the plans', async () => {
    mockState.member = true;
    usePlanStore.setState({ plan: 'free' });
    await renderUI(<CommunityView />);
    await fireEvent.press(screen.getByLabelText('Compare with: Everyone'));
    expect(screen.getByText('All 40 people on this leaderboard')).toBeTruthy();
    expect(screen.getAllByText('Supporter').length).toBe(3);
    await fireEvent.press(screen.getByLabelText('Friends. Needs Supporter, opens the plans'));
    expect(mockPush).toHaveBeenCalledWith('/profile/premium');
    expect(mockBoardKeys.every((k) => k.audience === 'everyone')).toBe(true);
  });

  it('a stored audience falls back to Everyone without the plan', async () => {
    mockState.member = true;
    usePlanStore.setState({ plan: 'free' });
    useBoardChoice.setState({ audience: 'friends' });
    await renderUI(<CommunityView />);
    expect(mockBoardKeys.length).toBeGreaterThan(0);
    expect(mockBoardKeys.every((k) => k.audience === 'everyone')).toBe(true);
  });

  it('Supporter: a real choice, part of the board query, with the audience shown', async () => {
    mockState.member = true;
    usePlanStore.setState({ plan: 'supporter' });
    await renderUI(<CommunityView />);
    await fireEvent.press(screen.getByLabelText('Compare with: Everyone'));
    expect(screen.queryByText('Supporter')).toBeNull();
    expect(screen.getByText('Places are counted among the people you pick.')).toBeTruthy();
    await fireEvent.press(
      screen.getByLabelText('Age and weight class. Your age group and weight class'),
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBoardKeys[mockBoardKeys.length - 1].audience).toBe('class');
    expect(screen.getByLabelText('Compare with: Age and weight class')).toBeTruthy();
    expect(screen.getByText('25-34 · 74–83 kg')).toBeTruthy();
    // The menu shows the choice as selected when opened again.
    await fireEvent.press(screen.getByLabelText('Compare with: Age and weight class'));
    expect(
      screen.getByRole('radio', { name: 'Age and weight class. Your age group and weight class' })
        .props.accessibilityState,
    ).toEqual({ checked: true });
    // No country known: the board says so.
    await fireEvent.press(screen.getByLabelText('Your country. People in your country'));
    expect(screen.getByText('No country yet')).toBeTruthy();
  });

  it('the period is a dropdown too', async () => {
    mockState.member = true;
    await renderUI(<CommunityView />);
    await fireEvent.press(screen.getByLabelText('Period: This month'));
    await fireEvent.press(screen.getByRole('radio', { name: 'This week' }));
    expect(screen.getByLabelText('Period: This week')).toBeTruthy();
    expect(useBoardChoice.getState().period).toBe('week');
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

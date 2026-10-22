import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { useAppearanceStore } from '@/design/appearance-store';
import { computeGamification } from '@/domain/gamification';
import { renderUI } from '@/test/render';
import { BadgeUnlockedSheet } from './BadgeUnlocked';
import { BadgeGrid, NextBadgeCard, RecordsRow, StreakCard } from './MeCards';
import { StreakWidget } from './StreakWidget';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, back: jest.fn() }),
}));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-14' }));
jest.mock('@/features/train/exercises', () => ({
  useExercises: () => ({ data: [{ id: 'bench', name: 'Bench press' }] }),
}));

const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
// Logged 2–13 Oct: a 12-day streak still alive on the 14th (today not logged yet). Trained 1–7 Oct:
// seven days in a row (Iron week).
const activity = {
  loggedDays: new Set(Array.from({ length: 12 }, (_, i) => day(i + 2))),
  workouts: Array.from({ length: 7 }, (_, i) => ({
    id: `w${i}`,
    day: day(i + 1),
    hour: 18,
    planId: null,
  })),
  dietOnTargetDays: new Set<string>(),
  checkInDays: new Set<string>(),
  exerciseDays: [
    { exerciseId: 'bench', day: day(2), bestWeightKg: 80, bestE1rmKg: 90 },
    { exerciseId: 'bench', day: day(9), bestWeightKg: 85, bestE1rmKg: 92 },
  ],
  daily: [],
};
const mockGame = {
  ...computeGamification({ ...activity, today: '2026-10-14', weekStart: 'mon', plan: 'supporter' }),
  activity,
};
jest.mock('./data', () => ({ useGamification: () => mockGame }));

describe('Progress · Me cards', () => {
  beforeEach(() => mockPush.mockClear());

  it('streak ring, level and the week drawn with ticks and dashes, not colour alone', async () => {
    await renderUI(<StreakCard game={mockGame} />);
    expect(
      screen.getByLabelText('12 day logging streak, 12 of 14 days to the next streak goal'),
    ).toBeTruthy();
    expect(screen.getByText('2 more days to a 14-day streak. Best: 12 days.')).toBeTruthy();
    expect(screen.getByText(`Level ${mockGame.level.level}`)).toBeTruthy();
    expect(screen.getByLabelText('Mon 12 Oct, logged')).toBeTruthy();
    expect(screen.getByLabelText('Tue 13 Oct, logged')).toBeTruthy();
    expect(screen.getByLabelText('Wed 14 Oct, today, not logged yet')).toBeTruthy();
    // The strip shows the week; the line under it says what to do, not the count again.
    expect(screen.getByText('Log today to keep it going')).toBeTruthy();
    expect(screen.queryByText(/days logged this week/)).toBeNull();
  });

  it('next badge and new records with the gain; a record opens its exercise', async () => {
    await renderUI(
      <>
        <NextBadgeCard game={mockGame} />
        <RecordsRow game={mockGame} />
      </>,
    );
    expect(screen.getByLabelText('Next badge, 10 workouts: 7 of 10')).toBeTruthy();
    const record = screen.getByLabelText(
      'Bench press: new record 85 kg, up 5 kg, 6.3 percent, 9 Oct',
    );
    expect(screen.getByText('+5 kg · +6.3%')).toBeTruthy();
    await fireEvent.press(record);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/progress/exercise/[exerciseId]',
      params: { exerciseId: 'bench' },
    });
  });

  it('no records yet: a friendly empty state saying how to set one', async () => {
    await renderUI(<RecordsRow game={{ ...mockGame, records: [] }} />);
    expect(screen.getByRole('header', { name: 'No new records yet' })).toBeTruthy();
    expect(screen.getByText(/Beat your best weight in any exercise/)).toBeTruthy();
  });

  it('badge grid: earned, in progress and locked with how to unlock', async () => {
    await renderUI(<BadgeGrid badges={mockGame.badges} />);
    // Supporter, First workout and the 1-day training streak.
    expect(screen.getByText(`3 of ${mockGame.badges.length} earned`)).toBeTruthy();
    expect(screen.getByLabelText('First workout: earned 1 Oct')).toBeTruthy();
    // Grouped by family, each with its header (DECISIONS 126).
    for (const family of ['Plans', 'Workouts', 'Diet', 'Streaks', 'Balance', 'Medals', 'All'])
      expect(screen.getByRole('header', { name: family })).toBeTruthy();
    // Plan badges have no day; rare and epic badges say so (DECISIONS 116).
    expect(screen.getByLabelText('Rare. Supporter: earned')).toBeTruthy();
    expect(screen.getByLabelText('Rare. Premium: locked. Have the Premium plan')).toBeTruthy();
    expect(screen.getAllByText('Epic', { includeHiddenElements: true }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('10 workouts: 7 of 10')).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Bronze medal: locked. Keep your diet, training, water goal and supplements on the same day',
      ),
    ).toBeTruthy();
  });
});

describe('Home streak card', () => {
  it('shows the streak, the week and the next badge, and opens Progress', async () => {
    await renderUI(<StreakWidget size="large" />);
    expect(screen.getByText('12-day streak')).toBeTruthy();
    expect(
      screen.getByLabelText('This week: 2 of 7 days logged, today not logged yet'),
    ).toBeTruthy();
    expect(screen.getByText('Log today to keep it going')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('12-day streak. Streak and badges'));
    expect(mockNavigate).toHaveBeenCalledWith('/progress');
  });
});

describe('Badge earned sheet', () => {
  it('names the badge, its XP and the next one; buttons work (static with reduce motion)', async () => {
    useAppearanceStore.setState({ reduceMotion: true });
    const onClose = jest.fn();
    const onSee = jest.fn();
    const badge = mockGame.badges.find((b) => b.id === 'first_workout')!;
    await renderUI(
      <BadgeUnlockedSheet
        badge={badge}
        others={1}
        level={mockGame.level}
        next={mockGame.badges.find((b) => b.id === 'workouts_10')!}
        onClose={onClose}
        onSeeBadges={onSee}
      />,
    );
    expect(screen.getByLabelText('Badge earned: First workout')).toBeTruthy();
    expect(screen.getByText('+10 XP')).toBeTruthy();
    expect(screen.getByText('Next: 10 workouts', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('You also earned 1 more badge.')).toBeTruthy();
    await fireEvent.press(screen.getByText('See badges'));
    expect(onSee).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Nice'));
    expect(onClose).toHaveBeenCalled();
    useAppearanceStore.setState({ reduceMotion: false });
  });
});

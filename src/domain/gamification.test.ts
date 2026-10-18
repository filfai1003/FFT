import { addDays } from './day';
import {
  DAILY_XP_CAP,
  XP,
  badgeStates,
  bestStreak,
  computeGamification,
  dailyXp,
  latestRecords,
  levelFor,
  nextBadges,
  nextStreakTarget,
  personalRecords,
  recordDays,
  streakWeek,
  xpForLevel,
  type ExerciseDay,
  type GamificationInput,
} from './gamification';

const TODAY = '2026-10-14'; // a Wednesday

const empty = (over: Partial<GamificationInput> = {}): GamificationInput => ({
  today: TODAY,
  loggedDays: new Set(),
  workouts: [],
  dietOnTargetDays: new Set(),
  checkInDays: new Set(),
  exerciseDays: [],
  ...over,
});

const run = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

describe('streak', () => {
  it('best streak is the longest run, ignoring future days', () => {
    const days = new Set([...run('2026-09-01', 5), ...run('2026-10-10', 3), '2026-10-20']);
    expect(bestStreak(days, TODAY)).toBe(5);
    expect(bestStreak(new Set(), TODAY)).toBe(0);
  });

  it('today not logged yet does not break the streak', () => {
    const g = computeGamification(empty({ loggedDays: new Set(run('2026-10-10', 4)) }));
    expect(g.streak).toBe(4);
    const broken = computeGamification(empty({ loggedDays: new Set(run('2026-10-10', 3)) }));
    expect(broken.streak).toBe(0);
  });

  it('this week: done, missed, today and future, not colour alone', () => {
    const week = streakWeek(new Set(['2026-10-12']), TODAY, 'mon');
    expect(week.map((d) => d.state)).toEqual([
      'done',
      'missed',
      'today',
      'future',
      'future',
      'future',
      'future',
    ]);
    expect(streakWeek(new Set([TODAY]), TODAY, 'sun')[3]).toEqual({ day: TODAY, state: 'done' });
  });

  it('next streak badge target', () => {
    expect(nextStreakTarget(0)).toBe(7);
    expect(nextStreakTarget(12)).toBe(14);
    expect(nextStreakTarget(500)).toBeNull();
  });
});

describe('personal records', () => {
  const rows: ExerciseDay[] = [
    { exerciseId: 'bench', day: '2026-09-01', bestWeightKg: 80, bestE1rmKg: 90 },
    { exerciseId: 'bench', day: '2026-09-08', bestWeightKg: 80, bestE1rmKg: 92 },
    { exerciseId: 'bench', day: '2026-10-02', bestWeightKg: 85, bestE1rmKg: 91 },
    { exerciseId: 'squat', day: '2026-10-01', bestWeightKg: 120, bestE1rmKg: 130 },
  ];

  it('the first day of an exercise is not a record; later bests are, with the gain', () => {
    const prs = personalRecords(rows, TODAY);
    expect(prs).toEqual([
      expect.objectContaining({ exerciseId: 'bench', day: '2026-09-08', kind: 'est1rm' }),
      {
        exerciseId: 'bench',
        day: '2026-10-02',
        kind: 'max',
        valueKg: 85,
        previousKg: 80,
        deltaKg: 5,
        pct: 6.3,
      },
    ]);
    expect(recordDays(prs)).toHaveLength(2);
  });

  it('equal weight is not a record; future rows are ignored', () => {
    const prs = personalRecords(
      [...rows, { exerciseId: 'squat', day: '2026-11-01', bestWeightKg: 200, bestE1rmKg: 210 }],
      TODAY,
    );
    expect(prs.some((p) => p.exerciseId === 'squat')).toBe(false);
  });

  it('latest record per exercise, newest first, max preferred on the same day', () => {
    const prs = personalRecords(
      [...rows, { exerciseId: 'squat', day: '2026-10-09', bestWeightKg: 127.5, bestE1rmKg: 140 }],
      TODAY,
    );
    const latest = latestRecords(prs, '2026-09-15');
    expect(latest.map((r) => [r.exerciseId, r.kind])).toEqual([
      ['squat', 'max'],
      ['bench', 'max'],
    ]);
  });
});

describe('XP and levels', () => {
  it('each source counts once a day and a day is capped', () => {
    const xp = dailyXp(
      empty({
        loggedDays: new Set([TODAY]),
        workouts: [
          { id: 'a', day: TODAY, hour: 9 },
          { id: 'b', day: TODAY, hour: 18 },
        ],
        dietOnTargetDays: new Set([TODAY]),
        checkInDays: new Set([TODAY]),
      }),
    );
    expect(xp.get(TODAY)).toBe(XP.loggedDay + XP.workout + XP.dietOnTarget + XP.checkIn);
  });

  it('records add XP up to 3 a day and the cap holds', () => {
    const many: ExerciseDay[] = ['a', 'b', 'c', 'd', 'e'].flatMap((id) => [
      { exerciseId: id, day: '2026-10-01', bestWeightKg: 50, bestE1rmKg: 55 },
      { exerciseId: id, day: TODAY, bestWeightKg: 60, bestE1rmKg: 65 },
    ]);
    const xp = dailyXp(
      empty({
        exerciseDays: many,
        loggedDays: new Set([TODAY]),
        workouts: [{ id: 'w', day: TODAY, hour: 9 }],
        dietOnTargetDays: new Set([TODAY]),
        checkInDays: new Set([TODAY]),
      }),
    );
    expect(xp.get(TODAY)).toBe(DAILY_XP_CAP);
    expect(dailyXp(empty({ exerciseDays: many })).get(TODAY)).toBe(XP.record * 3);
  });

  it('future days earn nothing', () => {
    expect(dailyXp(empty({ loggedDays: new Set(['2026-12-01']) })).size).toBe(0);
  });

  it('levels: each one asks 50 XP more than the last', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(250);
    expect(xpForLevel(4)).toBe(450);
    expect(levelFor(0)).toEqual({
      level: 1,
      xp: 0,
      levelStartXp: 0,
      nextLevelXp: 100,
      progress: 0,
    });
    const l = levelFor(300);
    expect(l.level).toBe(3);
    expect(l.progress).toBeCloseTo(50 / 200);
  });
});

describe('badges', () => {
  it('progress, unlock day and the next badge come from the data', () => {
    const workouts = run('2026-09-01', 12).map((day, i) => ({ id: `w${i}`, day, hour: 7 }));
    const badges = badgeStates(empty({ workouts }));
    const ten = badges.find((b) => b.id === 'workouts_10')!;
    expect(ten).toMatchObject({ earned: true, earnedOn: '2026-09-10', current: 10, share: 1 });
    const quarter = badges.find((b) => b.id === 'workouts_25')!;
    expect(quarter).toMatchObject({ earned: false, earnedOn: null, current: 12 });
    expect(badges.find((b) => b.id === 'early_bird')?.earned).toBe(true);
    expect(nextBadges(badges)[0]?.id).toBe('workouts_25');
  });

  it('a streak badge in progress shows the current streak, an earned one stays earned', () => {
    const logged = new Set([...run('2026-09-01', 8), ...run('2026-10-12', 3)]);
    const badges = badgeStates(empty({ loggedDays: logged }));
    expect(badges.find((b) => b.id === 'streak_7')).toMatchObject({
      earned: true,
      earnedOn: '2026-09-07',
    });
    expect(badges.find((b) => b.id === 'streak_14')).toMatchObject({ earned: false, current: 3 });
  });

  it('badge XP is added once to the level', () => {
    const g = computeGamification(empty({ workouts: [{ id: 'w', day: TODAY, hour: 12 }] }));
    // 50 for the workout + 25 for "First workout" (earned today).
    expect(g.level.xp).toBe(XP.workout + 25);
    expect(g.xpToday).toBe(XP.workout + 25);
  });
});

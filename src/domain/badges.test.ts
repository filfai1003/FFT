import en from '@/i18n/locales/en.json';
import { addDays } from './day';
import type { Macros } from './diet';
import {
  XP,
  badgeCatalogue,
  badgeFamilies,
  badgeStates,
  balancedWeeks,
  computeGamification,
  dietRespectedDays,
  isBalancedWeek,
  isCommunityBadge,
  medalDays,
  nextBadges,
  runMilestones,
  weekTotalsOnTarget,
  workoutRespectedDays,
  type DietDay,
  type GamificationInput,
} from './gamification';
import { balanceMuscles, WEEKLY_SETS_GUIDE, type VolumeSet } from './volume';

// 2026-10-14 is a Wednesday. Monday weeks: 09-28…10-04, 10-05…10-11, 10-12…10-18.
const TODAY = '2026-10-14';
const run = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const set = (...days: string[]) => new Set(days);

const empty = (over: Partial<GamificationInput> = {}): GamificationInput => ({
  today: TODAY,
  weekStart: 'mon',
  loggedDays: new Set(),
  workouts: [],
  dietOnTargetDays: new Set(),
  checkInDays: new Set(),
  exerciseDays: [],
  ...over,
});
const workouts = (days: string[]) => days.map((day, i) => ({ id: `w${i}`, day, hour: 18 }));
const find = (input: GamificationInput, id: string) => badgeStates(input).find((b) => b.id === id)!;

describe('workout rule: rest days (at most 2 a week, never 2 in a row)', () => {
  const sorted = (s: Set<string>) => [...s].sort();

  it('every day trained counts; today without a workout is still open', () => {
    const trained = set(...run('2026-10-05', 9)); // Mon 10-05 … Tue 10-13
    const ok = workoutRespectedDays(trained, TODAY, 'mon');
    expect(sorted(ok)).toEqual(run('2026-10-05', 9));
    expect(ok.has(TODAY)).toBe(false);
    // Trained today: it counts at once.
    expect(workoutRespectedDays(set(...run('2026-10-05', 10)), TODAY, 'mon').has(TODAY)).toBe(true);
  });

  it('a rest day after a workout counts; a second rest day in a row breaks', () => {
    const trained = set('2026-10-05', '2026-10-06', '2026-10-09');
    const ok = workoutRespectedDays(trained, TODAY, 'mon');
    expect(ok.has('2026-10-07')).toBe(true); // rest after a workout
    expect(ok.has('2026-10-08')).toBe(false); // second rest day in a row
    expect(ok.has('2026-10-09')).toBe(true); // a new run starts
  });

  it('the third rest day of a week breaks, even alternating with workouts', () => {
    // Mon T, Tue R, Wed T, Thu R, Fri T, Sat R, Sun T.
    const trained = set('2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11');
    const ok = workoutRespectedDays(trained, TODAY, 'mon');
    expect(ok.has('2026-10-06')).toBe(true);
    expect(ok.has('2026-10-08')).toBe(true);
    expect(ok.has('2026-10-10')).toBe(false);
  });

  it('two rest days across the end of the week (Sunday then Monday) break', () => {
    // Trained Mon 10-05 … Sat 10-10, rest Sun 10-11 and Mon 10-12, trained Tue 10-13.
    const trained = set(...run('2026-10-05', 6), '2026-10-13');
    const ok = workoutRespectedDays(trained, TODAY, 'mon');
    expect(ok.has('2026-10-11')).toBe(true); // first rest day of its week
    expect(ok.has('2026-10-12')).toBe(false); // the day before was a rest day
    const g = find(empty({ workouts: workouts([...trained]) }), 'train_run_10');
    expect(g.current).toBe(1); // only Tue 10-13 (today still open)
  });

  it('the allowance starts again with each week, following the week start', () => {
    // Every day from Thu 10-01 to Wed 10-14, except rest on Tue 10-06, Thu 10-08, Sun 10-11.
    const rests = ['2026-10-06', '2026-10-08', '2026-10-11'];
    const trained = set(...run('2026-10-01', 14).filter((d) => !rests.includes(d)));
    // Monday weeks: Tue, Thu and Sun are in the same week, so Sunday is the third.
    expect(workoutRespectedDays(trained, TODAY, 'mon').has('2026-10-11')).toBe(false);
    // Sunday weeks: Sunday 10-11 starts a new week, so it is the first rest day of it.
    expect(workoutRespectedDays(trained, TODAY, 'sun').has('2026-10-11')).toBe(true);
    expect(
      find(empty({ weekStart: 'sun', workouts: workouts([...trained]) }), 'train_run_10'),
    ).toMatchObject({ earned: true, earnedOn: '2026-10-10' });
  });

  it('a whole week covered by the run has at least 5 workouts', () => {
    // Five workouts and 2 rest days (never in a row): the whole week counts.
    const trained = set('2026-10-05', '2026-10-07', '2026-10-08', '2026-10-10', '2026-10-11');
    const ok = workoutRespectedDays(trained, TODAY, 'mon');
    expect(run('2026-10-05', 7).every((d) => ok.has(d))).toBe(true);
    // Four workouts: one of the 3 rest days breaks the run.
    const four = set('2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11');
    const ok4 = workoutRespectedDays(four, TODAY, 'mon');
    expect(run('2026-10-05', 7).filter((d) => ok4.has(d))).toHaveLength(6);
  });

  it('a run that starts mid-week is judged on its own days', () => {
    // Thu T, Fri R, Sat T, Sun T, Mon T…: the days before Thursday do not count against it.
    const trained = set('2026-10-08', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13');
    expect(find(empty({ workouts: workouts([...trained]) }), 'train_run_1').earned).toBe(true);
    expect(find(empty({ workouts: workouts([...trained]) }), 'train_run_10').current).toBe(6);
  });

  it('a rest day today does not break the run yet; nothing before the first workout counts', () => {
    expect(workoutRespectedDays(new Set(), TODAY, 'mon').size).toBe(0);
    const ok = workoutRespectedDays(set('2026-10-13'), TODAY, 'mon');
    expect([...ok]).toEqual(['2026-10-13']);
  });

  it('future workouts are ignored', () => {
    expect(workoutRespectedDays(set('2026-10-20'), TODAY, 'mon').size).toBe(0);
  });
});

describe('diet rule: on target, or a cheat day of a week on target', () => {
  const TARGET: Macros = { kcal: 2000, protein: 150, carbs: 200, fat: 60 };
  const day = (
    d: string,
    kcal = 2000,
    over: Partial<Macros> = {},
    target: Macros | null = TARGET,
  ): DietDay => ({
    day: d,
    eaten: { kcal, protein: 150, carbs: 200, fat: 60, ...over },
    target,
  });
  const week = run('2026-10-05', 7); // a complete Monday week

  it('on-target days count; no target or no food breaks', () => {
    const days = [day('2026-10-05'), day('2026-10-06', 2000, {}, null), day('2026-10-08')];
    const ok = dietRespectedDays(days, TODAY, 'mon');
    expect(ok.has('2026-10-05')).toBe(true);
    expect(ok.has('2026-10-06')).toBe(false); // no target (DECISIONS 104)
    expect(ok.has('2026-10-07')).toBe(false); // nothing logged
    expect(ok.has('2026-10-08')).toBe(true);
  });

  it('two off days of a week are cheat days when the week stays within 10%', () => {
    // 5 × 2000 + 2 × 2300 = 14 600 of 14 000 (+4.3%); carbs 1 520 of 1 400 (+8.6%).
    const days = week.map((d, i) => (i === 2 || i === 5 ? day(d, 2300, { carbs: 260 }) : day(d)));
    expect(weekTotalsOnTarget(days)).toBe(true);
    const ok = dietRespectedDays(days, TODAY, 'mon');
    expect(week.every((d) => ok.has(d))).toBe(true);
  });

  it('a third off day breaks, the first two still count', () => {
    const offs = [1, 3, 5];
    const days = week.map((d, i) => (offs.includes(i) ? day(d, 2300) : day(d)));
    const ok = dietRespectedDays(days, TODAY, 'mon');
    expect(ok.has(week[1]!)).toBe(true);
    expect(ok.has(week[3]!)).toBe(true);
    expect(ok.has(week[5]!)).toBe(false);
  });

  it('a week over by more than 10% loses its cheat days, not its on-target days', () => {
    // 5 × 2000 + 2 × 3500 = 17 000 of 14 000 (+21%).
    const days = week.map((d, i) => (i === 0 || i === 1 ? day(d, 3500) : day(d)));
    expect(weekTotalsOnTarget(days)).toBe(false);
    const ok = dietRespectedDays(days, TODAY, 'mon');
    expect(ok.has(week[0]!)).toBe(false);
    expect(ok.has(week[1]!)).toBe(false);
    expect(week.slice(2).every((d) => ok.has(d))).toBe(true);
  });

  it('every macro with a target must stay within 10% over the week', () => {
    // Calories fine all week, but protein at 100 of 150 every day: the cheat day is lost.
    const days = week.map((d, i) => day(d, i === 3 ? 2300 : 2000, { protein: 100 }));
    expect(weekTotalsOnTarget(days)).toBe(false);
    expect(dietRespectedDays(days, TODAY, 'mon').has(week[3]!)).toBe(false);
    // A macro without a target (0) is not checked.
    const noProtein = { ...TARGET, protein: 0 };
    const free = week.map((d, i) => day(d, i === 3 ? 2300 : 2000, { protein: 100 }, noProtein));
    expect(weekTotalsOnTarget(free)).toBe(true);
    expect(dietRespectedDays(free, TODAY, 'mon').has(week[3]!)).toBe(true);
  });

  it('the week in progress keeps its cheat days for now; totals are checked once it is over', () => {
    // This week (Mon 10-12 … today Wed 10-14): Monday far over, Tuesday on target.
    const days = [day('2026-10-12', 4000), day('2026-10-13')];
    const ok = dietRespectedDays(days, TODAY, 'mon');
    expect(ok.has('2026-10-12')).toBe(true);
    // The same days judged after the week ended: the total is far over, Monday is lost.
    const later = dietRespectedDays(days, '2026-10-19', 'mon');
    expect(later.has('2026-10-12')).toBe(false);
  });

  it('today off target is still open: neither counted nor breaking the run', () => {
    const days = [day('2026-10-12'), day('2026-10-13'), day(TODAY, 1200)];
    const ok = dietRespectedDays(days, TODAY, 'mon');
    expect(ok.has(TODAY)).toBe(false);
    expect(find(empty({ dietDays: days }), 'diet_run_10').current).toBe(2);
    // On target today: counted at once.
    expect(dietRespectedDays([...days.slice(0, 2), day(TODAY)], TODAY, 'mon').has(TODAY)).toBe(
      true,
    );
  });

  it('weeks follow the week start (Sunday weeks)', () => {
    // Off days Sat 10-10 and Sun 10-11 and Mon 10-12 (complete weeks judged at 10-20).
    const offs = ['2026-10-10', '2026-10-11', '2026-10-12'];
    const days = run('2026-10-04', 14).map((d) => (offs.includes(d) ? day(d, 2300) : day(d)));
    // Monday weeks: Sat and Sun are 2 cheat days of one week, Mon the first of the next.
    const mon = dietRespectedDays(days, '2026-10-20', 'mon');
    expect(offs.every((d) => mon.has(d))).toBe(true);
    // Sunday weeks: Sat 10-10 ends one week (1 off day), Sun 10-11 and Mon 10-12 open the next (2).
    const sun = dietRespectedDays(days, '2026-10-20', 'sun');
    expect(offs.every((d) => sun.has(d))).toBe(true);
    // Three off days inside one Sunday week: the third breaks.
    const three = ['2026-10-11', '2026-10-12', '2026-10-13'];
    const days3 = run('2026-10-04', 14).map((d) => (three.includes(d) ? day(d, 2300) : day(d)));
    expect(dietRespectedDays(days3, '2026-10-20', 'sun').has('2026-10-13')).toBe(false);
    expect(dietRespectedDays(days3, '2026-10-20', 'mon').has('2026-10-13')).toBe(true);
  });

  it('nothing logged: nothing counts', () => {
    expect(dietRespectedDays([], TODAY, 'mon').size).toBe(0);
    expect(weekTotalsOnTarget([])).toBe(false);
  });
});

describe('medals: diet, workouts, water and supplements on the same days', () => {
  const days = run('2026-10-05', 9); // Mon 10-05 … Tue 10-13
  const TARGET: Macros = { kcal: 2000, protein: 150, carbs: 200, fat: 60 };
  const base = (): Partial<GamificationInput> => ({
    dietDays: days.map((d) => ({ day: d, eaten: TARGET, target: TARGET })),
    workouts: workouts(days),
    waterGoalDays: new Set(days),
    supplementDays: new Set(days),
    supplementDueDays: new Set(days),
  });

  it('every condition on every day: a 9-day run (Bronze earned, Iron 9 of 10)', () => {
    expect(medalDays(empty(base())).size).toBe(9);
    expect(find(empty(base()), 'medal_bronze')).toMatchObject({
      earned: true,
      earnedOn: '2026-10-05',
    });
    expect(find(empty(base()), 'medal_iron')).toMatchObject({ earned: false, current: 9 });
  });

  it('a missed condition breaks it', () => {
    const noWater = { ...base(), waterGoalDays: new Set(days.filter((d) => d !== '2026-10-09')) };
    expect(find(empty(noWater), 'medal_iron').current).toBe(4);
    const missedPill = { ...base(), supplementDays: new Set(days.slice(1)) };
    expect(medalDays(empty(missedPill)).has(days[0]!)).toBe(false);
  });

  it('days without any supplement to take count as met', () => {
    const none = {
      ...base(),
      supplementDays: new Set<string>(),
      supplementDueDays: new Set<string>(),
    };
    expect(medalDays(empty(none)).size).toBe(9);
  });

  it('allowed rest days and cheat days count for medals too', () => {
    const rest = { ...base(), workouts: workouts(days.filter((d) => d !== '2026-10-07')) };
    expect(medalDays(empty(rest)).has('2026-10-07')).toBe(true);
  });
});

describe('balanced weeks (every muscle with a guideline within it)', () => {
  const perMuscle = (sets: number) =>
    Object.fromEntries(balanceMuscles.map(({ muscle }) => [muscle, { sets, volumeKg: 0 }]));
  const musclesOf = (id: string) => {
    const m = balanceMuscles.find((x) => x.muscle === id);
    return m ? { primary: m.muscle, secondary: [] } : undefined;
  };
  /** `n` hard sets (bodyweight) of every muscle on `day`. */
  const weekSets = (day: string, n: number): VolumeSet[] =>
    balanceMuscles.flatMap(({ muscle }) =>
      Array.from({ length: n }, (_, i) => ({
        sessionId: `s-${day}`,
        exerciseId: muscle,
        day,
        dropIndex: 0,
        weightKg: null,
        reps: 10 + i,
      })),
    );
  const N = WEEKLY_SETS_GUIDE.min + 2;

  it('isBalancedWeek: all within; one under or over is not', () => {
    expect(isBalancedWeek(perMuscle(N))).toBe(true);
    expect(
      isBalancedWeek({ ...perMuscle(N), [balanceMuscles[0]!.muscle]: { sets: 2, volumeKg: 0 } }),
    ).toBe(false);
    expect(isBalancedWeek(perMuscle(WEEKLY_SETS_GUIDE.max + 5))).toBe(false);
    expect(isBalancedWeek({})).toBe(false);
  });

  it('only completed weeks count; a week without workouts is not balanced and breaks the run', () => {
    const sets = [
      ...weekSets('2026-09-22', N), // week of 09-21
      ...weekSets('2026-09-29', N), // week of 09-28
      ...weekSets('2026-10-06', N), // week of 10-05
      ...weekSets('2026-10-13', N), // this week: never yet
    ];
    expect(balancedWeeks(sets, musclesOf, TODAY, 'mon')).toEqual([
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ]);
    const input = empty({
      volumeSets: sets,
      exerciseMuscles: new Map(
        balanceMuscles.map(({ muscle }) => [muscle, { primary: muscle, secondary: [] }]),
      ),
    });
    expect(find(input, 'balanced_weeks_1')).toMatchObject({ earned: true, earnedOn: '2026-09-21' });
    expect(find(input, 'balanced_run_10')).toMatchObject({ earned: false, current: 3 });
    // Without the week of 09-28 (no workouts): two separate runs, the current one is 1.
    const gap = sets.filter((s) => s.day !== '2026-09-29');
    expect(find({ ...input, volumeSets: gap }, 'balanced_run_10').current).toBe(1);
    expect(find({ ...input, volumeSets: gap }, 'balanced_weeks_10').current).toBe(2);
  });

  it('weeks in a row step by 7 days', () => {
    expect(runMilestones(set('2026-09-21', '2026-09-28', '2026-10-12'), TODAY, 7)).toEqual([
      '2026-09-21',
      '2026-09-28',
    ]);
  });
});

describe('lifetime counts and membership', () => {
  it('workouts, diet days, supplement ticks (each counts) and water days', () => {
    const input = empty({
      workouts: workouts(run('2026-09-01', 12)),
      dietLoggedDays: new Set(run('2026-09-01', 10)),
      supplementTicks: [
        ...run('2026-10-01', 3),
        '2026-10-01',
        '2026-10-01',
        ...run('2026-10-05', 5),
      ],
      waterGoalDays: new Set(['2026-10-01', '2026-12-01']),
    });
    expect(find(input, 'workouts_10')).toMatchObject({ earned: true, earnedOn: '2026-09-10' });
    expect(find(input, 'workouts_25')).toMatchObject({ earned: false, current: 12 });
    expect(find(input, 'diet_days_10')).toMatchObject({ earned: true, earnedOn: '2026-09-10' });
    expect(find(input, 'supplements_10')).toMatchObject({ earned: true, earnedOn: '2026-10-09' });
    expect(find(input, 'water_1').earned).toBe(true);
    expect(find(input, 'water_10').current).toBe(1); // the future day is ignored
  });

  it('member for N days: days since the first day of use', () => {
    const input = empty({ firstDay: '2026-10-07' });
    expect(find(input, 'member_1')).toMatchObject({ earned: true, earnedOn: '2026-10-08' });
    expect(find(input, 'member_7')).toMatchObject({ earned: true, earnedOn: TODAY });
    expect(find(input, 'member_30')).toMatchObject({ earned: false, current: 7 });
    expect(find(empty({ firstDay: TODAY }), 'member_1').earned).toBe(false);
    expect(find(empty(), 'member_1').current).toBe(0);
  });

  it('water and supplement runs count consecutive days only', () => {
    const input = empty({
      supplementDays: new Set(run('2026-10-01', 13)),
      waterGoalDays: new Set([...run('2026-10-01', 5), ...run('2026-10-10', 4)]),
    });
    expect(find(input, 'supplement_run_10')).toMatchObject({
      earned: true,
      earnedOn: '2026-10-10',
    });
    expect(find(input, 'water_run_10')).toMatchObject({ earned: false, current: 4 });
  });
});

describe('plans and "All challenges"', () => {
  it('Supporter while Supporter or Premium, Premium while Premium; never suggested', () => {
    const states = (plan: GamificationInput['plan']) => badgeStates(empty({ plan }));
    const earned = (plan: GamificationInput['plan']) =>
      states(plan)
        .filter((b) => b.family === 'plans' && b.earned)
        .map((b) => b.id);
    expect(earned(null)).toEqual([]);
    expect(earned('free')).toEqual([]);
    expect(earned('supporter')).toEqual(['supporter']);
    expect(earned('premium')).toEqual(['supporter', 'premium']);
    expect(states('premium').find((b) => b.id === 'premium')).toMatchObject({
      earnedOn: null,
      xp: 0,
    });
    expect(nextBadges(states(null), 99).some((b) => b.family === 'plans')).toBe(false);
  });

  it('All challenges asks for every other badge except the plan ones', () => {
    const all = find(empty({ plan: 'premium', workouts: workouts([TODAY]) }), 'all_challenges');
    expect(all.target).toBe(badgeCatalogue.length - 3);
    expect(all.earned).toBe(false);
    // First workout and the 1-day training streak are earned: 2 of the challenges.
    expect(all.current).toBe(2);
  });

  it('plan badges are never sent to the community', () => {
    expect(isCommunityBadge('premium')).toBe(false);
    expect(isCommunityBadge('supporter')).toBe(false);
    expect(isCommunityBadge('medal_gold')).toBe(true);
  });
});

describe('the catalogue', () => {
  it('has the owner list: 93 badges with unique, server-safe ids and texts', () => {
    expect(badgeCatalogue).toHaveLength(93);
    const ids = badgeCatalogue.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    const texts = en.badges as Record<string, { name: string; how: string }>;
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9_]{1,40}$/);
      expect(texts[id]?.name).toBeTruthy();
      expect(texts[id]?.how).toBeTruthy();
    }
    expect(Object.keys(texts).sort()).toEqual([...ids].sort());
    // The community gets every badge but the plan ones: the server accepts up to 128.
    expect(ids.filter(isCommunityBadge).length).toBeLessThanOrEqual(128);
  });

  it('families come in grid order, each with its words', () => {
    const order = badgeCatalogue.map((b) => badgeFamilies.indexOf(b.family));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const f of badgeFamilies) expect(en.game.family[f]).toBeTruthy();
  });

  it('rarity: common up to 25, rare 50–100, epic from 250; balance and medals their own', () => {
    for (const b of badgeCatalogue) {
      if (b.family === 'medals' || b.family === 'plans' || b.family === 'all') continue;
      if (b.family === 'balance')
        expect(b.rarity).toBe(b.target >= 100 ? 'epic' : b.target >= 25 ? 'rare' : 'common');
      else expect(b.rarity).toBe(b.target >= 250 ? 'epic' : b.target >= 50 ? 'rare' : 'common');
    }
    const medal = (t: string) => badgeCatalogue.find((b) => b.id === `medal_${t}`)!.rarity;
    expect(['bronze', 'iron', 'gold'].map(medal)).toEqual(['common', 'common', 'common']);
    expect(['platinum', 'emerald'].map(medal)).toEqual(['rare', 'rare']);
    expect(['diamond', 'master', 'champion'].map(medal)).toEqual(['epic', 'epic', 'epic']);
    expect(badgeCatalogue.find((b) => b.id === 'all_challenges')!.rarity).toBe('epic');
  });

  it('XP grows with difficulty inside each family; plans give none', () => {
    for (const f of badgeFamilies) {
      for (const metric of new Set(
        badgeCatalogue.filter((b) => b.family === f).map((b) => b.metric),
      )) {
        const xp = badgeCatalogue.filter((b) => b.metric === metric).map((b) => b.xp);
        if (metric === 'plan') expect(xp).toEqual([0, 0]);
        else expect(xp).toEqual([...xp].sort((a, b) => a - b));
      }
    }
  });

  it('badge XP is added once to the level', () => {
    const g = computeGamification(empty({ workouts: workouts([TODAY]) }));
    // 50 for the workout + 10 for "First workout" + 10 for the 1-day training streak.
    expect(g.level.xp).toBe(XP.workout + 20);
    expect(g.xpToday).toBe(XP.workout + 20);
  });
});

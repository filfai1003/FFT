import {
  ageGroupOf,
  canFilterAudience,
  communityGroups,
  countryCodeOf,
  weightClassOf,
  weightClassRange,
  communityPeriodEnd,
  communityPeriodStart,
  communityScores,
  daysLeft,
  movement,
  topPercent,
  type ScoreInput,
} from './community';

const TODAY = '2026-10-14'; // Wednesday

const input = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  today: TODAY,
  workouts: [],
  dietOnTargetDays: new Set(),
  daily: [],
  planDays: 0,
  muscleOf: () => 'chest',
  ...over,
});

const pick = (
  scores: ReturnType<typeof communityScores>,
  period: string,
  metric: string,
  subject = '',
) => scores.find((s) => s.period === period && s.metric === metric && s.subject === subject)?.value;

describe('community periods', () => {
  it('weeks start on Monday for everyone; months on the 1st', () => {
    expect(communityPeriodStart('week', TODAY)).toBe('2026-10-12');
    expect(communityPeriodStart('week', '2026-10-18')).toBe('2026-10-12');
    expect(communityPeriodStart('month', TODAY)).toBe('2026-10-01');
    expect(communityPeriodEnd('month', '2026-02-01')).toBe('2026-02-28');
    expect(daysLeft('month', TODAY)).toBe(17);
    expect(daysLeft('week', TODAY)).toBe(4);
  });
});

describe('community scores (what is sent)', () => {
  it('workouts count, at most two a day', () => {
    const s = communityScores(
      input({
        workouts: [
          { day: '2026-10-13', planId: null },
          { day: '2026-10-13', planId: null },
          { day: '2026-10-13', planId: null },
          { day: '2026-10-02', planId: null },
        ],
      }),
    );
    expect(pick(s, 'week', 'workouts')).toBe(2);
    expect(pick(s, 'month', 'workouts')).toBe(3);
  });

  it('diet: days on target over the days passed, today only once it counts', () => {
    const s = communityScores(input({ dietOnTargetDays: new Set(['2026-10-12', '2026-10-13']) }));
    expect(pick(s, 'week', 'diet')).toBe(100);
    const s2 = communityScores(
      input({ dietOnTargetDays: new Set(['2026-10-12', '2026-10-13', TODAY]) }),
    );
    expect(pick(s2, 'month', 'diet')).toBe(21.4);
  });

  it('diet without a target (DECISIONS 104): those days do not count; none at all, no score', () => {
    const none = communityScores(input({ dietTarget: () => false }));
    expect(pick(none, 'week', 'diet')).toBeUndefined();
    expect(pick(none, 'month', 'diet')).toBeUndefined();
    // Target removed on the 13th: only the 12th counts this week (on target = 100%).
    const s = communityScores(
      input({
        dietOnTargetDays: new Set(['2026-10-12']),
        dietTarget: (d) => d < '2026-10-13',
      }),
    );
    expect(pick(s, 'week', 'diet')).toBe(100);
  });

  it('training: plan workouts against the plan days per week; none without a plan', () => {
    expect(pick(communityScores(input()), 'week', 'training')).toBeUndefined();
    const s = communityScores(
      input({
        planDays: 4,
        workouts: [
          { day: '2026-10-12', planId: 'p' },
          { day: '2026-10-13', planId: null },
        ],
      }),
    );
    // 4 days a week, 3 days passed: 2 planned (rounded), 1 done from the plan.
    expect(pick(s, 'week', 'training')).toBe(50);
  });

  it('strength: overall, per group and per exercise, only exercises done on two days', () => {
    const s = communityScores(
      input({
        daily: [
          { exerciseId: 'bench', day: '2026-10-02', bestE1rmKg: 100, sets: 3, volumeKg: 0 },
          { exerciseId: 'bench', day: '2026-10-13', bestE1rmKg: 105, sets: 3, volumeKg: 0 },
          { exerciseId: 'squat', day: '2026-10-13', bestE1rmKg: 140, sets: 3, volumeKg: 0 },
        ],
      }),
    );
    expect(pick(s, 'month', 'strength')).toBe(5);
    expect(pick(s, 'month', 'strength', 'group:chest')).toBe(5);
    expect(pick(s, 'month', 'strength', 'exercise:bench')).toBe(5);
    expect(pick(s, 'month', 'strength', 'exercise:squat')).toBeUndefined();
    // Only one day of bench this week: no weekly strength score.
    expect(pick(s, 'week', 'strength')).toBeUndefined();
    // Never weights: only percentages and counts leave the device.
    for (const x of s)
      expect(Object.keys(x).sort()).toEqual([
        'metric',
        'period',
        'period_start',
        'subject',
        'value',
      ]);
  });
});

describe('places', () => {
  it('movement words and top percent', () => {
    expect(movement(4, 6)).toEqual({ kind: 'up', n: 2 });
    expect(movement(5, 4)).toEqual({ kind: 'down', n: 1 });
    expect(movement(3, 3)).toEqual({ kind: 'same', n: 0 });
    expect(topPercent(214, 1940)).toBe(12);
    expect(topPercent(1, 3)).toBe(34);
  });
});

describe('community groups (DECISIONS 117): buckets only', () => {
  it('age groups from the birth date, 18+ only, birthday counted', () => {
    expect(ageGroupOf('2001-10-15', '2026-10-14')).toBe('18-24'); // 24 until tomorrow
    expect(ageGroupOf('2001-10-14', '2026-10-14')).toBe('25-34');
    expect(ageGroupOf('1982-01-01', '2026-10-14')).toBe('35-44');
    expect(ageGroupOf('1972-06-01', '2026-10-14')).toBe('45-54');
    expect(ageGroupOf('1971-10-14', '2026-10-14')).toBe('55+');
    expect(ageGroupOf('2010-01-01', '2026-10-14')).toBeNull();
    expect(ageGroupOf(null, '2026-10-14')).toBeNull();
    expect(ageGroupOf('soon', '2026-10-14')).toBeNull();
  });

  it('weight classes by sex (IPF limits), with the top open class', () => {
    expect(weightClassOf('male', 59)).toBe('m59');
    expect(weightClassOf('male', 59.1)).toBe('m66');
    expect(weightClassOf('male', 78.4)).toBe('m83');
    expect(weightClassOf('male', 120)).toBe('m120');
    expect(weightClassOf('male', 131)).toBe('m120+');
    expect(weightClassOf('female', 62)).toBe('f63');
    expect(weightClassOf('female', 90)).toBe('f84+');
    expect(weightClassOf(null, 80)).toBeNull();
    expect(weightClassOf('male', null)).toBeNull();
    expect(weightClassOf('female', 5)).toBeNull();
  });

  it('class ranges for the label', () => {
    expect(weightClassRange('m83')).toEqual({ from: 74, to: 83 });
    expect(weightClassRange('m59')).toEqual({ from: null, to: 59 });
    expect(weightClassRange('f84+')).toEqual({ from: 84, to: null });
    expect(weightClassRange('m80')).toBeNull();
    expect(weightClassRange('m83+')).toBeNull();
  });

  it('country codes: two letters, user-assigned ones refused', () => {
    expect(countryCodeOf('it')).toBe('IT');
    expect(countryCodeOf(' GB ')).toBe('GB');
    expect(countryCodeOf('XX')).toBeNull();
    expect(countryCodeOf('ZZ')).toBeNull();
    expect(countryCodeOf('ITA')).toBeNull();
    expect(countryCodeOf(null)).toBeNull();
  });

  it('what is sent: never the birth date or the weight', () => {
    const g = communityGroups({
      today: '2026-10-14',
      birthDate: '1995-03-02',
      sex: 'male',
      weightKg: 78.4,
      country: 'it',
    });
    expect(g).toEqual({ country: 'IT', age_group: '25-34', weight_class: 'm83' });
    expect(JSON.stringify(g)).not.toMatch(/1995|78/);
  });

  it('paid audiences: Supporter and Premium', () => {
    expect(canFilterAudience('supporter')).toBe(true);
    expect(canFilterAudience('premium')).toBe(true);
    expect(canFilterAudience('free')).toBe(false);
    expect(canFilterAudience(null)).toBe(false);
  });
});

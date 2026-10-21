import { addDays } from './day';
import {
  expectedWaterShare,
  inQuietHours,
  planReminders,
  updateSent,
  usualTrainingWeekdays,
  weekdayOf,
  type PlannerInput,
} from './reminders';

// 2026-10-21 is a Wednesday.
const TODAY = '2026-10-21';
const h = (hour: number, minute = 0) => hour * 60 + minute;

function input(patch: Partial<PlannerInput> = {}): PlannerInput {
  return {
    today: TODAY,
    nowMin: h(7),
    horizonDays: 1,
    enabled: { meals: true, training: false, water: false, weekly: false },
    quiet: { start: h(22), end: h(7) },
    maxPerDay: 3,
    sent: new Set(),
    meals: {
      mode: 'tracking',
      times: [h(8), h(13), h(20)],
      fixed: [],
      loggedToday: new Set(),
    },
    training: {
      time: h(18),
      upNext: { id: 'd1', name: 'Push B' },
      workoutDays: [],
      trainedToday: false,
    },
    water: { time: h(15), todayMl: 0, goalMl: 2000 },
    weekly: { time: h(19), weekStart: 'mon' },
    ...patch,
  };
}

const ids = (p: { schedule: { id: string }[] }) => p.schedule.map((r) => r.id);

describe('planReminders: meals', () => {
  it('reminds of each meal at its time (count foods)', () => {
    const plan = planReminders(input());
    expect(ids(plan)).toEqual([
      `meal:breakfast:${TODAY}`,
      `meal:lunch:${TODAY}`,
      `meal:dinner:${TODAY}`,
    ]);
    expect(plan.schedule.map((r) => r.meal)).toEqual(['breakfast', 'lunch', 'dinner']);
  });

  it('skips a meal that already has food today, not tomorrow', () => {
    const plan = planReminders(
      input({
        horizonDays: 2,
        meals: { ...input().meals, loggedToday: new Set(['breakfast', 'lunch']) },
      }),
    );
    expect(ids(plan)).toEqual([
      `meal:dinner:${TODAY}`,
      `meal:breakfast:${addDays(TODAY, 1)}`,
      `meal:lunch:${addDays(TODAY, 1)}`,
      `meal:dinner:${addDays(TODAY, 1)}`,
    ]);
    expect(plan.relevant.has(`meal:lunch:${TODAY}`)).toBe(false);
  });

  it('does not schedule times already passed today', () => {
    expect(ids(planReminders(input({ nowMin: h(14) })))).toEqual([`meal:dinner:${TODAY}`]);
  });

  it('two times for the same meal give one reminder', () => {
    const meals = { ...input().meals, times: [h(12), h(14, 30)] };
    expect(ids(planReminders(input({ meals })))).toEqual([`meal:lunch:${TODAY}`]);
  });

  it('fixed meals: the plan meals in order on the sorted times, ticked ones skipped', () => {
    const meals: PlannerInput['meals'] = {
      mode: 'fixed_meals',
      times: [h(20), h(8), h(13)],
      fixed: [
        { id: 'm1', name: 'Oats' },
        { id: 'm2', name: 'Rice bowl' },
        { id: 'm3', name: 'Salmon' },
        { id: 'm4', name: 'Shake' },
      ],
      loggedToday: new Set(['m1']),
    };
    const plan = planReminders(input({ meals }));
    expect(plan.schedule.map((r) => [r.fixedMeal?.name, r.at])).toEqual([
      ['Rice bowl', h(13)],
      ['Salmon', h(20)],
    ]);
  });

  it('nothing when meal reminders are off', () => {
    const plan = planReminders(
      input({ enabled: { meals: false, training: false, water: false, weekly: false } }),
    );
    expect(plan.schedule).toEqual([]);
  });
});

describe('planReminders: quiet hours, cap and repeats', () => {
  it('drops reminders inside the quiet hours', () => {
    const meals = { ...input().meals, times: [h(6, 30), h(13), h(22, 30)] };
    expect(ids(planReminders(input({ nowMin: h(5), meals })))).toEqual([`meal:lunch:${TODAY}`]);
  });

  it('caps a day at maxPerDay, training first then meals in time order', () => {
    const plan = planReminders(
      input({
        maxPerDay: 3,
        enabled: { meals: true, training: true, water: true, weekly: false },
      }),
    );
    expect(ids(plan)).toEqual([
      `meal:breakfast:${TODAY}`,
      `meal:lunch:${TODAY}`,
      `training:${TODAY}`,
    ]);
  });

  it('counts reminders already delivered today in the cap', () => {
    const sent = new Set([`meal:breakfast:${TODAY}`, `meal:lunch:${TODAY}`]);
    const plan = planReminders(
      input({
        nowMin: h(14),
        sent,
        enabled: { meals: true, training: true, water: false, weekly: false },
      }),
    );
    expect(ids(plan)).toEqual([`training:${TODAY}`]);
  });

  it('never sends the same reminder twice, even when its time moved later', () => {
    const sent = new Set([`meal:lunch:${TODAY}`]);
    const meals = { ...input().meals, times: [h(15)] };
    expect(ids(planReminders(input({ nowMin: h(13, 30), sent, meals })))).toEqual([]);
  });

  it('rescheduling after a log removes the reminder of that meal', () => {
    const before = planReminders(input({ nowMin: h(12) }));
    expect(ids(before)).toContain(`meal:lunch:${TODAY}`);
    const after = planReminders(
      input({ nowMin: h(12, 5), meals: { ...input().meals, loggedToday: new Set(['lunch']) } }),
    );
    expect(ids(after)).toEqual([`meal:dinner:${TODAY}`]);
  });

  it('quiet hours that do not wrap midnight', () => {
    expect(inQuietHours(h(13), { start: h(12), end: h(14) })).toBe(true);
    expect(inQuietHours(h(14), { start: h(12), end: h(14) })).toBe(false);
    expect(inQuietHours(h(23), { start: h(22), end: h(7) })).toBe(true);
    expect(inQuietHours(h(6, 59), { start: h(22), end: h(7) })).toBe(true);
    expect(inQuietHours(h(7), { start: h(22), end: h(7) })).toBe(false);
    expect(inQuietHours(h(7), { start: h(7), end: h(7) })).toBe(false);
    expect(inQuietHours(h(7), null)).toBe(false);
  });
});

describe('planReminders: training', () => {
  // Mondays and Thursdays over the last 6 weeks.
  const history = Array.from({ length: 6 }, (_, w) => [
    addDays('2026-10-19', -7 * w), // Monday
    addDays('2026-10-15', -7 * w), // Thursday
  ]).flat();
  const training = (patch: Partial<PlannerInput['training']> = {}) =>
    input({
      horizonDays: 7,
      enabled: { meals: false, training: true, water: false, weekly: false },
      training: { ...input().training, workoutDays: history.filter((d) => d < TODAY), ...patch },
    });

  it('learns the usual weekdays from the last weeks', () => {
    expect(usualTrainingWeekdays(history, TODAY)).toEqual(new Set([1, 4]));
  });

  it('every day while there is too little history', () => {
    expect(usualTrainingWeekdays(['2026-10-19'], TODAY)).toBeNull();
  });

  it('reminds only on usual days, naming the Up next day', () => {
    const plan = planReminders(training());
    expect(plan.schedule.map((r) => weekdayOf(r.day))).toEqual([4, 1]);
    expect(plan.schedule[0]?.dayName).toBe('Push B');
  });

  it('not on a day already trained', () => {
    // Thursday 2026-10-22 as today, already trained.
    const plan = planReminders({ ...training({ trainedToday: true }), today: '2026-10-22' });
    expect(ids(plan)).not.toContain('training:2026-10-22');
    expect(plan.relevant.has('training:2026-10-22')).toBe(false);
  });

  it('without a plan the reminder has no day name', () => {
    const plan = planReminders(training({ upNext: null }));
    expect(plan.schedule[0]?.dayName).toBeNull();
  });
});

describe('planReminders: water and weekly summary', () => {
  it('water: only when behind for the time of day', () => {
    const on = { meals: false, training: false, water: true, weekly: false };
    expect(expectedWaterShare(h(15))).toBeCloseTo(7 / 13);
    expect(ids(planReminders(input({ enabled: on })))).toEqual([`water:${TODAY}`]);
    const ahead = planReminders(
      input({ enabled: on, water: { time: h(15), todayMl: 1500, goalMl: 2000 } }),
    );
    expect(ids(ahead)).toEqual([]);
  });

  it('weekly: on the last day of the week, Sunday for Monday weeks, Saturday for Sunday weeks', () => {
    const on = { meals: false, training: false, water: false, weekly: true };
    const mon = planReminders(input({ enabled: on }));
    expect(mon.schedule).toEqual([
      expect.objectContaining({ id: 'weekly:2026-10-19', day: '2026-10-25', at: h(19) }),
    ]);
    const sun = planReminders(input({ enabled: on, weekly: { time: h(19), weekStart: 'sun' } }));
    expect(sun.schedule[0]).toEqual(
      expect.objectContaining({ day: '2026-10-24', weekFrom: '2026-10-18' }),
    );
  });

  it('weekly: after Sunday evening it moves to the next week, and is outside the cap', () => {
    const on = { meals: true, training: false, water: false, weekly: true };
    const plan = planReminders(
      input({ today: '2026-10-25', nowMin: h(20), maxPerDay: 0, enabled: on }),
    );
    expect(ids(plan)).toEqual(['weekly:2026-10-26']);
  });
});

describe('updateSent', () => {
  it('remembers what went off and forgets old days', () => {
    const sent = updateSent(
      ['meal:lunch:2026-10-01'],
      [
        { id: `meal:breakfast:${TODAY}`, day: TODAY, at: h(8) },
        { id: `meal:dinner:${TODAY}`, day: TODAY, at: h(20) },
      ],
      TODAY,
      h(9),
    );
    expect(sent).toEqual([`meal:breakfast:${TODAY}`]);
  });
});

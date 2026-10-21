import { defaultReminderTimes, formatClock, nextMealTime, sanitizeTimes } from './reminder-times';

describe('reminder times', () => {
  it('formats a clock with two digits', () => {
    expect(formatClock({ hour: 8, minute: 5 })).toBe('08:05');
    expect(formatClock({ hour: 18, minute: 0 })).toBe('18:00');
  });

  it('falls back to the defaults for anything missing or damaged', () => {
    expect(sanitizeTimes(null)).toEqual(defaultReminderTimes);
    const t = sanitizeTimes({
      workout: { hour: 25, minute: 30 },
      checkin: { weekday: 9, hour: 7, minute: 15 },
      meals: [{ hour: 9, minute: 0 }],
    });
    expect(t.workout).toEqual({ hour: 18, minute: 30 });
    expect(t.checkin).toEqual({ weekday: 5, hour: 7, minute: 15 });
    expect(t.meals).toEqual([{ hour: 9, minute: 0 }]); // a saved list is kept, any length
  });

  it('keeps valid saved times', () => {
    const saved = {
      workout: { hour: 6, minute: 45 },
      checkin: { weekday: 2, hour: 21, minute: 0 },
      meals: [
        { hour: 7, minute: 30 },
        { hour: 12, minute: 30 },
        { hour: 19, minute: 0 },
      ],
    };
    expect(sanitizeTimes(saved)).toEqual({ ...defaultReminderTimes, ...saved });
    const smart = {
      ...saved,
      water: { hour: 16, minute: 30 },
      weekly: { hour: 20, minute: 0 },
      quiet: { on: false, start: { hour: 23, minute: 0 }, end: { hour: 6, minute: 30 } },
      maxPerDay: 5,
    };
    expect(sanitizeTimes(smart)).toEqual(smart);
    expect(sanitizeTimes({ maxPerDay: 40 }).maxPerDay).toBe(3);
    expect(sanitizeTimes({ quiet: { on: 'yes' } }).quiet).toEqual(defaultReminderTimes.quiet);
  });

  it('meal reminders: none, a few or many; a new one comes 3 hours after the latest', () => {
    expect(sanitizeTimes({ meals: [] }).meals).toEqual([]);
    const ten = Array.from({ length: 10 }, (_, i) => ({ hour: 8 + i, minute: 0 }));
    expect(sanitizeTimes({ meals: ten }).meals).toHaveLength(10);
    expect(sanitizeTimes({ meals: [{ hour: 30, minute: 0 }] }).meals).toEqual([
      { hour: 12, minute: 0 },
    ]);
    expect(nextMealTime([])).toEqual({ hour: 12, minute: 0 });
    expect(
      nextMealTime([
        { hour: 8, minute: 0 },
        { hour: 13, minute: 30 },
      ]),
    ).toEqual({ hour: 16, minute: 30 });
    expect(nextMealTime([{ hour: 22, minute: 0 }])).toEqual({ hour: 1, minute: 0 });
  });
});

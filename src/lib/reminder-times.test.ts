import { defaultReminderTimes, formatClock, sanitizeTimes } from './reminder-times';

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
    expect(t.meals).toEqual([
      { hour: 9, minute: 0 },
      { hour: 13, minute: 0 },
      { hour: 20, minute: 0 },
    ]);
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
    expect(sanitizeTimes(saved)).toEqual(saved);
  });
});

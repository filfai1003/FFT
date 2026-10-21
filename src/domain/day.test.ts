import {
  compactDateLabel,
  longDateLabel,
  monthGrid,
  shiftMonth,
  shortDateLabel,
  weekdayLetters,
} from './day';

describe('date labels', () => {
  it('long and compact forms (half-width Home cards use the compact one)', () => {
    expect(shortDateLabel('2026-10-18')).toBe('Sun 18 Oct');
    expect(compactDateLabel('2026-10-18')).toBe('Sun 18');
    expect(compactDateLabel('2026-10-08')).toBe('Thu 8');
    expect(longDateLabel('2026-10-14')).toBe('Wednesday 14 October');
  });
});

describe('month grid', () => {
  it('starts on the week start with blanks, and lists every day of the month', () => {
    const mon = monthGrid('2026-10', 'mon');
    // 1 October 2026 is a Thursday: three blanks before it on a Monday week.
    expect(mon.slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(mon.filter(Boolean)).toHaveLength(31);
    expect(monthGrid('2026-10', 'sun').slice(0, 5)).toEqual([null, null, null, null, '2026-10-01']);
  });

  it('moves between months across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(weekdayLetters('sun')[0]).toBe('S');
  });
});

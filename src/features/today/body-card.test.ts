import { hasBodyFat, homeBodySeries } from './body-card';

const entries = [
  { day: '2026-10-18', weightKg: 80, bodyFatPct: null },
  { day: '2026-08-01', weightKg: 85, bodyFatPct: 22 },
  { day: '2026-09-10', weightKg: 82, bodyFatPct: null },
  { day: '2026-10-01', weightKg: 81, bodyFatPct: 20 },
];

describe('homeBodySeries', () => {
  it('six weekly averages of the period, the latest value and the change, in any order', () => {
    const s = homeBodySeries(entries, 'weight', '2026-10-18');
    expect(s.from).toBe('2026-09-06');
    expect(s.latest).toBe(80);
    expect(s.latestDay).toBe('2026-10-18');
    expect(s.delta).toBe(-2);
    expect(s.line.length).toBeGreaterThan(1);
    expect(s.line.length).toBeLessThanOrEqual(6);
    expect(s.line.at(-1)).toBe(80);
  });

  it('one value in the period: no line, no change, but the latest value (even older)', () => {
    const s = homeBodySeries(entries, 'bodyFat', '2026-10-18');
    expect(s.latest).toBe(20);
    expect(s.line).toEqual([]);
    expect(s.delta).toBeNull();
  });

  it('a past day ignores what was logged after it', () => {
    const s = homeBodySeries(entries, 'weight', '2026-10-05');
    expect(s.latest).toBe(81);
    expect(s.delta).toBe(-1);
    expect(hasBodyFat(entries, '2026-07-01')).toBe(false);
    expect(hasBodyFat(entries, '2026-10-05')).toBe(true);
  });
});

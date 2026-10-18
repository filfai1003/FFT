import { clamp, formatInt, parseDecimal, stepValue } from './numbers';
import { loggingStreak } from './streak';

describe('numbers', () => {
  it('clamp', () => {
    expect(clamp(5, 1, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('stepValue respects bounds and avoids float noise', () => {
    expect(stepValue(4, 1, 1, 10)).toBe(5);
    expect(stepValue(1, -1, 1, 10)).toBe(1);
    expect(stepValue(0.1, 0.2, 0, 10)).toBe(0.3);
    expect(stepValue(22.5, 2.5, 0, 500)).toBe(25);
  });

  it('parseDecimal accepts dot and comma, rejects junk', () => {
    expect(parseDecimal('12')).toBe(12);
    expect(parseDecimal('12.5')).toBe(12.5);
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal(' 7 ')).toBe(7);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1.2.3')).toBeNull();
    expect(parseDecimal('-3')).toBeNull();
  });

  it('formatInt rounds and groups thousands', () => {
    expect(formatInt(2700)).toBe('2,700');
    expect(formatInt(1160.4)).toBe('1,160');
    expect(formatInt(999)).toBe('999');
    expect(formatInt(1234567)).toBe('1,234,567');
    expect(formatInt(-1500)).toBe('-1,500');
    expect(formatInt(0)).toBe('0');
  });
});

describe('loggingStreak', () => {
  const days = (...d: string[]) => new Set(d);
  it('counts back from today when today is logged', () => {
    expect(loggingStreak(days('2026-10-18', '2026-10-17', '2026-10-16'), '2026-10-18')).toBe(3);
  });
  it('keeps the streak alive while today is not logged yet', () => {
    expect(loggingStreak(days('2026-10-17', '2026-10-16'), '2026-10-18')).toBe(2);
  });
  it('breaks on a missed day', () => {
    expect(loggingStreak(days('2026-10-18', '2026-10-16'), '2026-10-18')).toBe(1);
    expect(loggingStreak(days('2026-10-16'), '2026-10-18')).toBe(0);
    expect(loggingStreak(days(), '2026-10-18')).toBe(0);
  });
  it('crosses month ends', () => {
    expect(loggingStreak(days('2026-11-01', '2026-10-31', '2026-10-30'), '2026-11-01')).toBe(3);
  });
});

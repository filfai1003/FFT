import { clamp, parseDecimal, stepValue } from './numbers';

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
});

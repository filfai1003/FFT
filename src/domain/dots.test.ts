import { columnLevels, dotsOn } from './dots';

describe('dotsOn (values from the mockups)', () => {
  it('calories on Today: 990 of 2350 in 40 dots', () => {
    expect(dotsOn(990, 2350, 40)).toBe(17);
  });

  it('calories in the food log: 990 of 2350 in 30 dots', () => {
    expect(dotsOn(990, 2350, 30)).toBe(13);
  });

  it('macros in 10 dots', () => {
    expect(dotsOn(92, 160, 10)).toBe(6);
    expect(dotsOn(118, 260, 10)).toBe(5);
    expect(dotsOn(38, 75, 10)).toBe(5);
  });

  it('caps over goal and handles empty/invalid input', () => {
    expect(dotsOn(3000, 2350, 40)).toBe(40);
    expect(dotsOn(0, 2350, 40)).toBe(0);
    expect(dotsOn(-5, 2350, 40)).toBe(0);
    expect(dotsOn(10, 0, 40)).toBe(0);
  });
});

describe('columnLevels', () => {
  const strength = [0, 0.8, 1.5, 2.4, 3.1, 3.6, 4.5, 5.2, 6.0, 6.9, 7.6, 8.4];

  it('keeps every column visible and spans the full height', () => {
    const levels = columnLevels(strength, 0, 8.4, 8);
    expect(levels[0]).toBe(1);
    expect(levels[levels.length - 1]).toBe(8);
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(1);
  });

  it('is monotonic for a rising series', () => {
    const levels = columnLevels(strength, 0, 8.4, 8);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });

  it('does not divide by zero when all values are equal', () => {
    expect(columnLevels([5, 5, 5], 5, 5, 8)).toEqual([4, 4, 4]);
  });

  it('body weight example: falling weight, last value lowest', () => {
    const w = [81.2, 81.0, 80.7, 80.5, 80.1, 79.9, 79.6, 79.4, 79.1, 78.9, 78.6, 78.4];
    const levels = columnLevels(w, 78.4, 81.2, 5);
    expect(levels[0]).toBe(5);
    expect(levels[11]).toBe(1);
  });
});

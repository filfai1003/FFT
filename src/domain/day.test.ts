import { compactDateLabel, shortDateLabel } from './day';

describe('date labels', () => {
  it('long and compact forms (half-width Home cards use the compact one)', () => {
    expect(shortDateLabel('2026-10-18')).toBe('Sun 18 Oct');
    expect(compactDateLabel('2026-10-18')).toBe('Sun 18');
    expect(compactDateLabel('2026-10-08')).toBe('Thu 8');
  });
});

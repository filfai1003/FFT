import type { BodyEntry } from './data';
import { bodyProgress } from './series';

const e = (
  day: string,
  weightKg: number | null,
  bodyFatPct: number | null,
  measures: BodyEntry['measures'] = {},
): BodyEntry => ({
  id: day,
  day,
  createdAt: `${day}T08:00:00Z`,
  weightKg,
  bodyFatPct,
  method: bodyFatPct != null ? 'scale' : null,
  measures,
  notes: null,
});

const entries = [
  e('2026-07-16', 81.2, 18.9, { waist: 86 }),
  e('2026-08-20', 79.6, 17.8, { waist: 84 }),
  e('2026-10-07', 78.7, 17.0, { waist: 82.5 }),
  e('2026-10-08', 78.4, 16.8),
];

describe('bodyProgress', () => {
  const p = bodyProgress(entries, '12w', '2026-10-08');

  it('range and latest values', () => {
    expect(p.from).toBe('2026-07-16');
    expect(p.weight.latestKg).toBe(78.4);
    expect(p.weight.latestDay).toBe('2026-10-08');
    expect(p.bodyFat.latestPct).toBe(16.8);
  });

  it('weight change over the period and the 7-day average', () => {
    expect(p.weight.buckets).toHaveLength(12);
    expect(p.weight.deltaKg).toBe(-2.8);
    expect(p.weight.sevenDayKg).toBe(78.6); // (78.7 + 78.4) / 2 = 78.55
  });

  it('body fat points and lean / fat mass (mockup: 65.2 / 13.2 kg)', () => {
    expect(p.bodyFat.deltaPts).toBe(-2.1);
    expect(p.bodyFat.leanKg).toBe(65.2);
    expect(p.bodyFat.fatKg).toBe(13.2);
    expect(p.bodyFat.fatDelta).toBe(-2.1); // 15.3 -> 13.2
  });

  it('measurements: latest value and change since the start of the period', () => {
    expect(p.measures.waist).toEqual({ value: 82.5, delta: -3.5 });
    expect(p.measures.hips).toBeNull();
  });

  it('a shorter period starts later', () => {
    const w4 = bodyProgress(entries, '4w', '2026-10-08');
    expect(w4.from).toBe('2026-09-10');
    expect(w4.weight.buckets).toHaveLength(4);
    expect(w4.weight.points.map((x) => x.day)).toEqual(['2026-10-07', '2026-10-08']);
    expect(w4.measures.waist).toEqual({ value: 82.5, delta: 0 });
  });

  it('no data at all gives empty values, not errors', () => {
    const empty = bodyProgress([], '12w', '2026-10-08');
    expect(empty.weight.latestKg).toBeNull();
    expect(empty.weight.buckets.every((v) => v == null)).toBe(true);
    expect(empty.bodyFat.leanKg).toBeNull();
  });
});

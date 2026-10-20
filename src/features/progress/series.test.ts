import type { BodyEntry } from './data';
import { bodyProgress, changeArea } from './series';

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

describe('changeArea', () => {
  it('weight follows the profile goal, neutral without one or when steady', () => {
    expect(changeArea(-1.2, 'lose_fat')).toBe('better');
    expect(changeArea(0.8, 'lose_fat')).toBe('worse');
    expect(changeArea(0.8, 'build_muscle')).toBe('better');
    expect(changeArea(-0.8, 'build_muscle')).toBe('worse');
    expect(changeArea(-2, 'maintain')).toBe('neutral');
    expect(changeArea(-2, null)).toBe('neutral');
    expect(changeArea(0.02, 'lose_fat')).toBe('neutral');
    expect(changeArea(null, 'lose_fat')).toBe('neutral');
  });

  it('with a target: green toward it, red away from it, whatever the general rule', () => {
    // 98.75 kg now (up 0.25), target 90 kg: further away.
    expect(changeArea(0.25, 'build_muscle', 0.05, { latest: 98.75, target: 90 })).toBe('worse');
    // Losing fat but the target is 60 kg at 55 kg: going up is the right way.
    expect(changeArea(1, 'lose_fat', 0.05, { latest: 56, target: 60 })).toBe('better');
    // Body fat 24 % falling toward 15 %: better; rising: worse.
    expect(changeArea(-0.5, 'smallerIsBetter', 0.05, { latest: 24, target: 15 })).toBe('better');
    expect(changeArea(0.5, 'smallerIsBetter', 0.05, { latest: 24, target: 15 })).toBe('worse');
    // Overshooting past the target counts by distance: 14 -> 13 with 15 % as the goal is away.
    expect(changeArea(-1, 'smallerIsBetter', 0.05, { latest: 13, target: 15 })).toBe('worse');
    // No target: the general rule.
    expect(changeArea(-1, 'lose_fat', 0.05, { latest: 80, target: null })).toBe('better');
    expect(changeArea(0.02, 'lose_fat', 0.05, { latest: 80, target: 70 })).toBe('neutral');
  });

  it('body fat and waist: smaller is better', () => {
    expect(changeArea(-0.5, 'smallerIsBetter')).toBe('better');
    expect(changeArea(1, 'smallerIsBetter')).toBe('worse');
    expect(changeArea(0, 'smallerIsBetter')).toBe('neutral');
  });
});

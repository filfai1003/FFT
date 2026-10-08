import {
  bodyMasses,
  bucketAverages,
  bucketCount,
  change,
  exerciseChanges,
  goalProgress,
  groupScores,
  periodStart,
  scoreSeries,
  sevenDayAverage,
  weeklyVolumeChange,
  weightedScore,
  type DailyE1rm,
} from './progress';

describe('periods', () => {
  it('start dates', () => {
    expect(periodStart('4w', '2026-10-08', null)).toBe('2026-09-10');
    expect(periodStart('12w', '2026-10-08', null)).toBe('2026-07-16'); // "SINCE JUL 16" in the mockup
    expect(periodStart('1y', '2026-10-08', null)).toBe('2025-10-08');
    expect(periodStart('all', '2026-10-08', '2026-05-01')).toBe('2026-05-01');
    expect(periodStart('all', '2026-10-08', null)).toBe('2026-07-16');
    expect(bucketCount('4w')).toBe(4);
    expect(bucketCount('12w')).toBe(12);
  });
});

describe('bucketAverages', () => {
  const points = [
    { day: '2026-07-16', value: 81.2 },
    { day: '2026-07-17', value: 81.0 },
    { day: '2026-08-20', value: 79.6 },
    { day: '2026-10-08', value: 78.4 },
  ];

  it('averages inside each slice and carries the last value over empty slices', () => {
    const b = bucketAverages(points, '2026-07-16', '2026-10-08', 12);
    expect(b).toHaveLength(12);
    expect(b[0]).toBe(81.1);
    expect(b[1]).toBe(81.1); // nothing logged: carried over, no drop
    expect(b[11]).toBe(78.4);
    expect(b.every((v) => v != null)).toBe(true);
  });

  it('leading slices without data are null', () => {
    const b = bucketAverages([{ day: '2026-10-01', value: 70 }], '2026-07-16', '2026-10-08', 12);
    expect(b[0]).toBeNull();
    expect(b[11]).toBe(70);
  });

  it('ignores points outside the range', () => {
    expect(
      bucketAverages([{ day: '2026-01-01', value: 99 }], '2026-07-16', '2026-10-08', 4),
    ).toEqual([null, null, null, null]);
  });
});

describe('series helpers', () => {
  it('7-day average, change and goal progress match the weight mockup', () => {
    const pts = [
      { day: '2026-10-02', value: 79.0 },
      { day: '2026-10-05', value: 78.5 },
      { day: '2026-10-07', value: 78.7 },
      { day: '2026-10-08', value: 78.4 },
    ];
    expect(sevenDayAverage(pts, '2026-10-08')).toBe(78.7); // 78.65 rounds up
    expect(sevenDayAverage(pts, '2026-09-01')).toBeNull();
    expect(change([81.2, null, 78.4])).toBe(-2.8);
    expect(change([78.4])).toBeNull();
    // goal 76.0 from 81.2: at 78.4 it is 2.4 kg to go and 54% of the way
    expect(goalProgress(81.2, 78.4, 76.0)).toBeCloseTo(0.538, 2);
    expect(goalProgress(70, 75, 80)).toBe(0.5); // gaining works too
    expect(goalProgress(70, 60, 80)).toBe(0); // clamped
    expect(goalProgress(70, 70, 70)).toBe(1);
  });

  it('lean and fat mass from the body fat mockup (78.4 kg, 16.8%)', () => {
    expect(bodyMasses(78.4, 16.8)).toEqual({ fatKg: 13.2, leanKg: 65.2 });
  });
});

describe('strength score (same cases as the SQL tests)', () => {
  const d = (
    exerciseId: string,
    day: string,
    e: number | null,
    sets: number,
    volumeKg = 0,
  ): DailyE1rm => ({
    exerciseId,
    day,
    bestE1rmKg: e,
    sets,
    volumeKg,
  });
  const rows = [
    d('bench', '2026-09-01', 100, 2, 700),
    d('bench', '2026-09-20', 110, 1, 110),
    d('squat', '2026-09-01', 100, 1, 100),
    d('squat', '2026-09-20', 130, 1, 130),
    d('curl', '2026-09-20', 30, 3), // one day only: left out
  ];
  const muscle = (id: string) => ({ bench: 'chest', squat: 'legs', curl: 'biceps' })[id] as never;

  it('per exercise: first vs last, two days minimum', () => {
    const c = exerciseChanges(rows, '2026-08-01', '2026-10-08');
    expect(c.map((x) => [x.exerciseId, x.pctChange, x.sets])).toEqual([
      ['bench', 10, 3],
      ['squat', 30, 2],
    ]);
  });

  it('overall is the set-weighted average: (10x3 + 30x2) / 5 = 18', () => {
    expect(weightedScore(exerciseChanges(rows, '2026-08-01', '2026-10-08'))).toBe(18);
    expect(weightedScore([])).toBeNull();
  });

  it('per muscle group, best first', () => {
    const g = groupScores(exerciseChanges(rows, '2026-08-01', '2026-10-08'), muscle);
    expect(g).toEqual([
      { group: 'legs', pctChange: 30, sets: 2 },
      { group: 'chest', pctChange: 10, sets: 3 },
    ]);
  });

  it('periods cut the data: only the last 2 weeks have a single day for each exercise', () => {
    expect(exerciseChanges(rows, '2026-09-15', '2026-10-08')).toEqual([]);
  });

  it('the series rises as the period fills up', () => {
    const s = scoreSeries(rows, '2026-09-01', '2026-09-30', 3);
    expect(s[0]).toBeNull(); // first third: only one day of data
    expect(s[2]).toBe(18);
  });

  it('weekly volume change: tail vs head of the period', () => {
    const v = [d('a', '2026-07-20', 100, 1, 1000), d('a', '2026-10-05', 100, 1, 1400)];
    expect(weeklyVolumeChange(v, '2026-07-16', '2026-10-08')).toBe(40);
    expect(weeklyVolumeChange([], '2026-07-16', '2026-10-08')).toBeNull();
  });
});

import type { Muscle } from '@/domain/muscles';
import { exerciseChanges, scoreSeries, weightedScore, type DailyE1rm } from '@/domain/progress';
import { groupDetail, type useStrength } from './strength';

const row = (exerciseId: string, day: string, kg: number): DailyE1rm => ({
  exerciseId,
  day,
  bestE1rmKg: kg,
  sets: 3,
  volumeKg: kg * 15,
});

// Bench (chest) goes up, squat (legs) goes down.
const rows = [
  row('bench', '2026-09-01', 100),
  row('bench', '2026-10-10', 110),
  row('squat', '2026-09-02', 150),
  row('squat', '2026-10-11', 140),
];
const muscle: Record<string, Muscle> = { bench: 'chest', squat: 'quads' };
const from = '2026-08-30';
const to = '2026-10-14';
const changes = exerciseChanges(rows, from, to);
const s = {
  from,
  to,
  weeks: 7,
  rows,
  changes,
  series: scoreSeries(rows, from, to, 4),
  overall: weightedScore(changes),
  muscleOf: (id: string) => muscle[id],
} as unknown as ReturnType<typeof useStrength>;

describe('groupDetail', () => {
  it("draws the group's own score, not the overall one (DECISIONS 114)", () => {
    const chest = groupDetail(s, 'chest');
    const legs = groupDetail(s, 'legs');
    expect(chest.series).toHaveLength(4);
    expect(chest.series.at(-1)).toBeGreaterThan(0);
    expect(legs.series.at(-1)).toBeLessThan(0);
    expect(chest.series).not.toEqual(s.series);
  });
});

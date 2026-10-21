import {
  guideStatus,
  hardSets,
  mostBehind,
  muscleBalance,
  muscleVolume,
  rangeDays,
  withinCount,
  type ExerciseMuscles,
  type VolumeSet,
} from './volume';

const muscles: Record<string, ExerciseMuscles> = {
  bench: { primary: 'chest', secondary: ['triceps', 'shoulders'] },
  row: { primary: 'back', secondary: ['biceps'] },
  plank: { primary: 'abs', secondary: [] },
  // A secondary that repeats the primary is ignored.
  odd: { primary: 'legs', secondary: ['legs', 'glutes', 'glutes'] },
};
const musclesOf = (id: string) => muscles[id];

const set = (p: Partial<VolumeSet>): VolumeSet => ({
  sessionId: 's1',
  exerciseId: 'bench',
  day: '2026-10-20',
  dropIndex: 0,
  weightKg: 100,
  reps: 8,
  ...p,
});

describe('hardSets', () => {
  it('leaves out warm-ups (lighter than 60% of the heaviest set of that exercise that workout)', () => {
    const sets = [
      set({ weightKg: 40, reps: 10 }),
      set({ weightKg: 60, reps: 5 }),
      set({ weightKg: 100 }),
      set({ weightKg: 90 }),
    ];
    expect(hardSets(sets).map((s) => s.weightKg)).toEqual([60, 100, 90]);
  });

  it('leaves out drop-set continuations and sets with 0 reps', () => {
    const sets = [set({}), set({ dropIndex: 1, weightKg: 80 }), set({ reps: 0 })];
    expect(hardSets(sets)).toHaveLength(1);
  });

  it('counts every set without weight (bodyweight, time) and judges each workout on its own', () => {
    const sets = [
      set({ exerciseId: 'plank', weightKg: null, reps: null }),
      set({ exerciseId: 'plank', weightKg: 0, reps: 12 }),
      set({ sessionId: 's2', weightKg: 50 }),
    ];
    expect(hardSets(sets)).toHaveLength(3);
  });
});

describe('muscleVolume', () => {
  it('gives the primary muscle 1 set and each secondary 0.5; volume shared the same way', () => {
    const v = muscleVolume([set({}), set({})], musclesOf, '2026-10-19', '2026-10-25');
    expect(v.chest).toEqual({ sets: 2, volumeKg: 1600 });
    expect(v.triceps).toEqual({ sets: 1, volumeKg: 800 });
    expect(v.shoulders.sets).toBe(1);
    expect(v.back.sets).toBe(0);
  });

  it('counts drops in volume only, warm-ups in volume (like the views) but not in sets', () => {
    const v = muscleVolume(
      [set({}), set({ dropIndex: 1, weightKg: 80, reps: 10 }), set({ weightKg: 40, reps: 10 })],
      musclesOf,
      '2026-10-19',
      '2026-10-25',
    );
    expect(v.chest.sets).toBe(1);
    expect(v.chest.volumeKg).toBe(800 + 800 + 400);
  });

  it('ignores a repeated secondary and days outside the range', () => {
    const v = muscleVolume(
      [set({ exerciseId: 'odd' }), set({ day: '2026-10-12' })],
      musclesOf,
      '2026-10-19',
      '2026-10-25',
    );
    expect(v.legs.sets).toBe(1);
    expect(v.glutes.sets).toBe(0.5);
    expect(v.chest.sets).toBe(0);
  });
});

describe('rangeDays', () => {
  // 2026-10-21 is a Wednesday.
  it('follows the week start', () => {
    expect(rangeDays('this', '2026-10-21', 'mon')).toEqual({
      from: '2026-10-19',
      to: '2026-10-21',
      weeks: 1,
    });
    expect(rangeDays('this', '2026-10-21', 'sun').from).toBe('2026-10-18');
    expect(rangeDays('last', '2026-10-21', 'mon')).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
      weeks: 1,
    });
  });

  it('averages the four whole weeks before this one', () => {
    expect(rangeDays('avg4', '2026-10-21', 'mon')).toEqual({
      from: '2026-09-21',
      to: '2026-10-18',
      weeks: 4,
    });
  });
});

describe('guideline', () => {
  it('under below 10, within 10 to 20, over above 20', () => {
    expect(guideStatus(9.5)).toBe('under');
    expect(guideStatus(10)).toBe('within');
    expect(guideStatus(20)).toBe('within');
    expect(guideStatus(20.5)).toBe('over');
  });
});

describe('muscleBalance', () => {
  const sets = [
    // This week (from Monday 19th): 12 bench sets, 4 rows.
    ...Array.from({ length: 12 }, () => set({})),
    ...Array.from({ length: 4 }, () => set({ exerciseId: 'row', day: '2026-10-19' })),
    // Two weeks ago: 6 rows.
    ...Array.from({ length: 6 }, () => set({ exerciseId: 'row', day: '2026-10-07' })),
  ];

  it('lists every muscle in push / pull / legs / core order with its status', () => {
    const rows = muscleBalance(sets, musclesOf, 'this', '2026-10-21', 'mon');
    expect(rows.map((r) => r.muscle)).toEqual([
      'chest',
      'shoulders',
      'triceps',
      'back',
      'biceps',
      'legs',
      'glutes',
      'abs',
    ]);
    const chest = rows.find((r) => r.muscle === 'chest')!;
    expect(chest).toMatchObject({ movement: 'push', sets: 12, status: 'within' });
    expect(rows.find((r) => r.muscle === 'back')).toMatchObject({ sets: 4, status: 'under' });
    expect(withinCount(rows)).toBe(1);
  });

  it('averages per week over four weeks', () => {
    const rows = muscleBalance(sets, musclesOf, 'avg4', '2026-10-21', 'mon');
    expect(rows.find((r) => r.muscle === 'back')!.sets).toBe(1.5);
    expect(rows.find((r) => r.muscle === 'biceps')!.sets).toBe(0.8);
  });

  it('names the group most behind, or nobody when nothing was trained', () => {
    const rows = muscleBalance(sets, musclesOf, 'this', '2026-10-21', 'mon');
    // Legs, glutes and abs have 0: the first of them in display order.
    expect(mostBehind(rows)?.muscle).toBe('legs');
    expect(mostBehind(muscleBalance([], musclesOf, 'this', '2026-10-21', 'mon'))).toBeNull();
  });
});

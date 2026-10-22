import { catalogue } from '@/lib/local-db/catalogue';
import { normalizeMuscles } from './muscles';
import {
  behindList,
  guidedCount,
  guideOf,
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
  bench: { primary: 'chest', secondary: ['front_delts', 'triceps'], indirect: [] },
  row: { primary: 'upper_back', secondary: ['lats', 'biceps'], indirect: ['rear_delts'] },
  plank: { primary: 'abs', secondary: ['obliques'], indirect: [] },
  // A secondary repeating the primary, or an indirect repeating a secondary, counts once.
  odd: { primary: 'quads', secondary: ['quads', 'glutes', 'glutes'], indirect: ['glutes'] },
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
  it('gives the primary muscle 1 set, each secondary 0.5, each indirect 0.25; volume the same', () => {
    const v = muscleVolume(
      [set({}), set({}), set({ exerciseId: 'row' })],
      musclesOf,
      '2026-10-19',
      '2026-10-25',
    );
    expect(v.chest).toEqual({ sets: 2, volumeKg: 1600 });
    expect(v.triceps).toEqual({ sets: 1, volumeKg: 800 });
    expect(v.front_delts.sets).toBe(1);
    expect(v.upper_back.sets).toBe(1);
    expect(v.lats.sets).toBe(0.5);
    expect(v.rear_delts).toEqual({ sets: 0.25, volumeKg: 200 });
    expect(v.quads.sets).toBe(0);
  });

  it('the back squat of the catalogue: quads 1, glutes and adductors 0.5, hamstrings and lower back 0.25', () => {
    const squat = catalogue.find((e) => e.slug === 'back-squat')!;
    const m = normalizeMuscles(squat)!;
    const v = muscleVolume([set({ exerciseId: 'squat' })], () => m, '2026-10-19', '2026-10-25');
    expect(v.quads.sets).toBe(1);
    expect(v.glutes.sets).toBe(0.5);
    expect(v.adductors.sets).toBe(0.5);
    expect(v.hamstrings.sets).toBe(0.25);
    expect(v.lower_back.sets).toBe(0.25);
    expect(v.calves.sets).toBe(0);
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

  it('counts a muscle once at its highest level, and ignores days outside the range', () => {
    const v = muscleVolume(
      [set({ exerciseId: 'odd' }), set({ day: '2026-10-12' })],
      musclesOf,
      '2026-10-19',
      '2026-10-25',
    );
    expect(v.quads.sets).toBe(1);
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

  it('helper muscles have no guideline (DECISIONS 125)', () => {
    expect(guideOf('front_delts')).toBeNull();
    expect(guideOf('forearms')).toBeNull();
    expect(guideOf('obliques')).toBeNull();
    expect(guideOf('adductors')).toBeNull();
    expect(guideOf('lower_back')).toBeNull();
    expect(guideOf('calves')).toEqual({ min: 10, max: 20 });
    expect(guideStatus(3, null)).toBe('none');
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

  it('lists the 17 muscles in group order with their status', () => {
    const rows = muscleBalance(sets, musclesOf, 'this', '2026-10-21', 'mon');
    expect(rows).toHaveLength(17);
    expect(rows.map((r) => r.group)).toEqual([
      'chest',
      'back',
      'back',
      'back',
      'shoulders',
      'shoulders',
      'shoulders',
      'arms',
      'arms',
      'arms',
      'legs',
      'legs',
      'legs',
      'legs',
      'legs',
      'core',
      'core',
    ]);
    expect(rows.find((r) => r.muscle === 'chest')).toMatchObject({ sets: 12, status: 'within' });
    expect(rows.find((r) => r.muscle === 'upper_back')).toMatchObject({
      sets: 4,
      status: 'under',
    });
    expect(rows.find((r) => r.muscle === 'rear_delts')!.sets).toBe(1);
    // Front shoulders get 6 sets from the bench press: shown, but not judged.
    expect(rows.find((r) => r.muscle === 'front_delts')).toMatchObject({
      sets: 6,
      status: 'none',
    });
    expect(withinCount(rows)).toBe(1);
    expect(guidedCount(rows)).toBe(12);
  });

  it('averages per week over four weeks, one decimal', () => {
    const rows = muscleBalance(sets, musclesOf, 'avg4', '2026-10-21', 'mon');
    expect(rows.find((r) => r.muscle === 'upper_back')!.sets).toBe(1.5);
    expect(rows.find((r) => r.muscle === 'biceps')!.sets).toBe(0.8);
  });

  it('names the guided muscles most behind, or nobody when nothing was trained', () => {
    const rows = muscleBalance(sets, musclesOf, 'this', '2026-10-21', 'mon');
    // Side shoulders is the first guided muscle with 0 sets in display order (lats have 2).
    expect(mostBehind(rows)?.muscle).toBe('side_delts');
    const behind = behindList(rows).map((r) => r.muscle);
    expect(behind).not.toContain('front_delts');
    // Fewest first: lats and biceps 2 (display order), upper back 4, triceps 6 (from the bench).
    expect(behind.slice(-4)).toEqual(['lats', 'biceps', 'upper_back', 'triceps']);
    expect(mostBehind(muscleBalance([], musclesOf, 'this', '2026-10-21', 'mon'))).toBeNull();
  });
});

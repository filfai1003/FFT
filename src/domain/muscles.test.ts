import { catalogue } from '@/lib/local-db/catalogue';
import {
  isMuscle,
  legacyMuscles,
  listExercises,
  muscleLoad,
  muscles,
  musclesByGroup,
  muscleShares,
  normalizeMuscles,
  strengthGroup,
  strengthGroups,
} from './muscles';

describe('muscles (DECISIONS 125)', () => {
  it('17 muscles, each in one of the six groups', () => {
    expect(muscles).toHaveLength(17);
    expect(strengthGroups.flatMap((g) => musclesByGroup[g])).toEqual([...muscles]);
    expect(musclesByGroup.back).toEqual(['lats', 'upper_back', 'lower_back']);
    expect(musclesByGroup.shoulders).toEqual(['front_delts', 'side_delts', 'rear_delts']);
    expect(musclesByGroup.arms).toEqual(['biceps', 'triceps', 'forearms']);
    expect(musclesByGroup.legs).toEqual(['quads', 'hamstrings', 'glutes', 'adductors', 'calves']);
    expect(musclesByGroup.core).toEqual(['abs', 'obliques']);
  });

  it('maps every muscle, old ones included, to its strength group', () => {
    expect(strengthGroup('chest')).toBe('chest');
    expect(strengthGroup('upper_back')).toBe('back');
    expect(strengthGroup('rear_delts')).toBe('shoulders');
    expect(strengthGroup('forearms')).toBe('arms');
    expect(strengthGroup('adductors')).toBe('legs');
    expect(strengthGroup('obliques')).toBe('core');
    for (const m of legacyMuscles) expect(strengthGroups).toContain(strengthGroup(m));
    expect(strengthGroup('back')).toBe('back');
    expect(strengthGroup('legs')).toBe('legs');
    expect(strengthGroup('glutes')).toBe('legs');
  });

  it('shares: primary 1, secondary 0.5, indirect 0.25, each muscle once at its highest level', () => {
    const shares = muscleShares({
      primary: 'quads',
      secondary: ['glutes', 'adductors', 'quads'],
      indirect: ['hamstrings', 'lower_back', 'glutes'],
    });
    expect(Object.fromEntries(shares)).toEqual({
      quads: 1,
      glutes: 0.5,
      adductors: 0.5,
      hamstrings: 0.25,
      lower_back: 0.25,
    });
  });

  it('old muscles map like the migration of the user exercises', () => {
    expect(normalizeMuscles({ primary: 'back', secondary: ['biceps'] })).toEqual({
      primary: 'lats',
      secondary: ['upper_back', 'biceps'],
      indirect: [],
    });
    expect(normalizeMuscles({ primary: 'shoulders', secondary: ['triceps'] })).toEqual({
      primary: 'front_delts',
      secondary: ['triceps'],
      indirect: [],
    });
    expect(normalizeMuscles({ primary: 'legs', secondary: ['glutes', 'back'] })).toEqual({
      primary: 'quads',
      secondary: ['glutes', 'upper_back'],
      indirect: ['lats'],
    });
    expect(normalizeMuscles({ primary: 'chest', secondary: ['shoulders', 'legs'] })).toEqual({
      primary: 'chest',
      secondary: ['front_delts', 'quads'],
      indirect: [],
    });
    // Today's names stay as they are; unknown helpers are dropped, an unknown primary is refused.
    expect(
      normalizeMuscles({ primary: 'calves', secondary: ['wings'], indirect: ['hamstrings'] }),
    ).toEqual({ primary: 'calves', secondary: [], indirect: ['hamstrings'] });
    expect(normalizeMuscles({ primary: 'wings' })).toBeNull();
  });

  it('the catalogue: every exercise has one known primary muscle and each muscle once', () => {
    expect(catalogue.length).toBeGreaterThanOrEqual(60);
    for (const e of catalogue) {
      expect(isMuscle(e.primary)).toBe(true);
      const all = [e.primary, ...e.secondary, ...e.indirect];
      expect(all.every(isMuscle)).toBe(true);
      expect(new Set(all).size).toBe(all.length);
      // Already in today's vocabulary: nothing to map.
      expect(normalizeMuscles(e)).toEqual({
        primary: e.primary,
        secondary: e.secondary,
        indirect: e.indirect,
      });
    }
    // Every muscle is the main muscle of at least one catalogue exercise, except the helpers
    // that are trained through the big lifts.
    const primaries = new Set(catalogue.map((e) => e.primary));
    for (const m of muscles)
      if (!['forearms', 'adductors'].includes(m)) expect(primaries.has(m)).toBe(true);
  });

  it('the back squat: quads 1, glutes and adductors 0.5, hamstrings and lower back 0.25', () => {
    const squat = catalogue.find((e) => e.slug === 'back-squat')!;
    expect(muscleLoad(normalizeMuscles(squat)!)).toEqual({
      quads: 1,
      glutes: 0.5,
      adductors: 0.5,
      hamstrings: 0.25,
      lower_back: 0.25,
    });
  });

  it('list_exercises: the old fields plus group and muscles; filter by muscle or group', () => {
    const rows = [
      {
        name: 'Back squat',
        primary_muscle: 'quads',
        secondary_muscles: ['glutes'],
        indirect_muscles: ['lower_back'],
        equipment: 'barbell',
      },
      { name: 'My row', primary_muscle: 'back', secondary_muscles: null, equipment: 'cables' },
    ];
    expect(listExercises(rows)).toEqual([
      {
        name: 'Back squat',
        muscle: 'quads',
        group: 'legs',
        muscles: { quads: 1, glutes: 0.5, lower_back: 0.25 },
        equipment: 'barbell',
      },
      {
        name: 'My row',
        muscle: 'lats',
        group: 'back',
        muscles: { lats: 1, upper_back: 0.5 },
        equipment: 'cables',
      },
    ]);
    expect(listExercises(rows, 'quads').map((e) => e.name)).toEqual(['Back squat']);
    expect(listExercises(rows, 'legs').map((e) => e.name)).toEqual(['Back squat']);
    expect(listExercises(rows, 'Back').map((e) => e.name)).toEqual(['My row']);
    expect(listExercises(rows, 'glutes')).toEqual([]);
  });
});

import { strengthGroup } from '@/domain/muscles';
import { exerciseMeta, filterExercises, groupByMuscle, recordLabel } from './exercise-filter';
import type { Exercise } from './exercises';

const ex = (
  name: string,
  primary: Exercise['primaryMuscle'],
  more: Partial<Exercise> = {},
): Exercise => ({
  id: name,
  ownerId: null,
  name,
  primaryMuscle: primary,
  secondaryMuscles: [],
  equipment: 'barbell',
  logType: 'weight_reps',
  imagePath: null,
  ...more,
});

const list = [
  ex('Barbell bench press', 'chest', { secondaryMuscles: ['shoulders', 'triceps'] }),
  ex('Incline Smith press', 'chest', { ownerId: 'me', equipment: 'machine' }),
  ex('Pull-up', 'back', { logType: 'reps', equipment: 'bodyweight' }),
  ex('Dumbbell curl', 'biceps'),
  ex('Crunch', 'abs'),
  ex('Hip thrust', 'glutes'),
];

describe('strength groups', () => {
  it('maps fine muscles to the six groups', () => {
    expect(strengthGroup('biceps')).toBe('arms');
    expect(strengthGroup('triceps')).toBe('arms');
    expect(strengthGroup('abs')).toBe('core');
    expect(strengthGroup('glutes')).toBe('legs');
    expect(strengthGroup('chest')).toBe('chest');
  });
});

describe('filterExercises', () => {
  it('filters by group, including mapped muscles', () => {
    expect(filterExercises(list, { query: '', filter: 'arms' }).map((e) => e.name)).toEqual([
      'Dumbbell curl',
    ]);
    expect(filterExercises(list, { query: '', filter: 'core' }).map((e) => e.name)).toEqual([
      'Crunch',
    ]);
    expect(filterExercises(list, { query: '', filter: 'legs' }).map((e) => e.name)).toEqual([
      'Hip thrust',
    ]);
  });

  it('"mine" shows only own exercises', () => {
    expect(filterExercises(list, { query: '', filter: 'mine' }).map((e) => e.name)).toEqual([
      'Incline Smith press',
    ]);
  });

  it('search is case and accent insensitive and combines with the filter', () => {
    expect(filterExercises(list, { query: 'PRESS', filter: 'all' })).toHaveLength(2);
    expect(filterExercises(list, { query: 'press', filter: 'mine' })).toHaveLength(1);
    expect(
      filterExercises([ex('Crème curl', 'biceps')], { query: 'creme', filter: 'all' }),
    ).toHaveLength(1);
  });
});

describe('grouping and labels', () => {
  it('groups by primary muscle in a fixed order, sorted by name', () => {
    const groups = groupByMuscle(list);
    expect(groups.map((g) => g.muscle)).toEqual(['chest', 'back', 'biceps', 'glutes', 'abs']);
    expect(groups[0].items.map((e) => e.name)).toEqual([
      'Barbell bench press',
      'Incline Smith press',
    ]);
  });

  it('meta line lists primary, secondary and equipment', () => {
    expect(exerciseMeta(list[0])).toBe('Chest · shoulders · triceps · barbell');
  });

  it('record label in the unit of the user', () => {
    const r = {
      exerciseId: 'x',
      actualMaxKg: 80,
      est1rmKg: 93.3,
      completedSets: 4,
      bestReps: null,
      bestDurationS: null,
    };
    expect(recordLabel(list[0], r, 'kg')).toEqual({
      kind: 'weight',
      max: '80',
      est: '93',
      unit: 'kg',
    });
    expect(recordLabel(list[0], r, 'lb')).toMatchObject({
      kind: 'weight',
      max: '176.4',
      est: '206',
    });
    expect(recordLabel(list[0], undefined, 'kg')).toEqual({ kind: 'none' });
    expect(recordLabel(list[2], { ...r, bestReps: 10 }, 'kg')).toEqual({ kind: 'reps', reps: 10 });
  });
});

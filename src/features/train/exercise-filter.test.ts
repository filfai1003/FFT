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
  indirectMuscles: [],
  equipment: 'barbell',
  logType: 'weight_reps',
  imagePath: null,
  ...more,
});

const list = [
  ex('Barbell bench press', 'chest', { secondaryMuscles: ['front_delts', 'triceps'] }),
  ex('Incline Smith press', 'chest', { ownerId: 'me', equipment: 'machine' }),
  ex('Pull-up', 'lats', { logType: 'reps', equipment: 'bodyweight' }),
  ex('Dumbbell curl', 'biceps'),
  ex('Wrist curl', 'forearms'),
  ex('Side plank', 'obliques'),
  ex('Face pull', 'rear_delts'),
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
    expect(strengthGroup('forearms')).toBe('arms');
    expect(strengthGroup('obliques')).toBe('core');
    expect(strengthGroup('rear_delts')).toBe('shoulders');
    expect(strengthGroup('lats')).toBe('back');
  });
});

describe('filterExercises', () => {
  it('filters by group, including mapped muscles', () => {
    expect(filterExercises(list, { query: '', filter: 'arms' }).map((e) => e.name)).toEqual([
      'Dumbbell curl',
      'Wrist curl',
    ]);
    expect(filterExercises(list, { query: '', filter: 'core' }).map((e) => e.name)).toEqual([
      'Side plank',
      'Crunch',
    ]);
    expect(filterExercises(list, { query: '', filter: 'legs' }).map((e) => e.name)).toEqual([
      'Hip thrust',
    ]);
    expect(filterExercises(list, { query: '', filter: 'shoulders' }).map((e) => e.name)).toEqual([
      'Face pull',
    ]);
    expect(filterExercises(list, { query: '', filter: 'back' }).map((e) => e.name)).toEqual([
      'Pull-up',
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
    expect(groups.map((g) => g.muscle)).toEqual([
      'chest',
      'lats',
      'rear_delts',
      'biceps',
      'forearms',
      'glutes',
      'abs',
      'obliques',
    ]);
    expect(groups[0].items.map((e) => e.name)).toEqual([
      'Barbell bench press',
      'Incline Smith press',
    ]);
  });

  it('meta line lists primary, secondary and equipment, in words', () => {
    const name = (m: string) => (m === 'front_delts' ? 'Front shoulders' : m);
    expect(exerciseMeta(list[0], name)).toBe('Chest · front shoulders · triceps · barbell');
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

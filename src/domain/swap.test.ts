import { equipmentAt, swapCandidates, type SwapExercise } from './swap';

const ex = (
  id: string,
  primaryMuscle: string,
  equipment: string,
  secondaryMuscles: string[] = [],
  logType = 'weight_reps',
): SwapExercise => ({ id, name: id, primaryMuscle, secondaryMuscles, equipment, logType });

const bench = ex('bench', 'chest', 'barbell', ['shoulders', 'triceps']);
const all = [
  bench,
  ex('db-bench', 'chest', 'dumbbells', ['shoulders', 'triceps']),
  ex('pec-deck', 'chest', 'machine'),
  ex('push-up', 'chest', 'bodyweight', ['triceps'], 'reps'),
  ex('cable-fly', 'chest', 'cables', ['shoulders']),
  ex('squat', 'legs', 'barbell'),
];

describe('swap exercise', () => {
  it('same main muscle only, never itself or what is already in the workout', () => {
    const ids = swapCandidates(bench, all, ['cable-fly'], 'gym').map((c) => c.exercise.id);
    expect(ids).not.toContain('bench');
    expect(ids).not.toContain('cable-fly');
    expect(ids).not.toContain('squat');
  });

  it('at the gym: same way of logging and shared muscles first', () => {
    const ids = swapCandidates(bench, all, [], 'gym').map((c) => c.exercise.id);
    expect(ids).toEqual(['db-bench', 'cable-fly', 'pec-deck', 'push-up']);
  });

  it('at home: what can be done there comes first, the rest is marked', () => {
    const list = swapCandidates(bench, all, [], 'home');
    expect(list.map((c) => c.exercise.id)).toEqual([
      'db-bench',
      'push-up',
      'cable-fly',
      'pec-deck',
    ]);
    expect(list.filter((c) => c.otherEquipment).map((c) => c.exercise.id)).toEqual([
      'cable-fly',
      'pec-deck',
    ]);
  });

  it('equipment by place', () => {
    expect(equipmentAt('gym')).toBeNull();
    expect(equipmentAt('bodyweight')).toEqual(['bodyweight', 'bands']);
  });
});

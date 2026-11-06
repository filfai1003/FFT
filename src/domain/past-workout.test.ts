import {
  findExercise,
  parseNewExercise,
  parsePastWorkout,
  pastWorkoutRows,
  pastWorkoutSets,
} from './past-workout';

const known = [
  { id: 'bench', name: 'Bench press', log_type: 'weight_reps', owner_id: null },
  { id: 'plank', name: 'Plank', log_type: 'time', owner_id: null },
  { id: 'run', name: 'Run', log_type: 'distance_time', owner_id: null },
  { id: 'pull', name: 'Pull-up', log_type: 'reps', owner_id: null },
];
const today = '2026-11-06';
const parse = (input: Record<string, unknown>) =>
  parsePastWorkout({ day: '2026-03-02', ...input }, today, known);
const bench = (sets: unknown[]) => [{ exercise: 'bench press', sets }];

describe('own exercises', () => {
  it('each muscle at one level only', () => {
    expect(
      parseNewExercise({
        name: ' Landmine press ',
        primary_muscle: 'front_delts',
        secondary_muscles: ['triceps', 'front_delts'],
        indirect_muscles: ['triceps', 'abs'],
        equipment: 'barbell',
      }),
    ).toEqual({
      name: 'Landmine press',
      primaryMuscle: 'front_delts',
      secondaryMuscles: ['triceps'],
      indirectMuscles: ['abs'],
      equipment: 'barbell',
      logType: 'weight_reps',
    });
  });

  it('refuses what the app could not show', () => {
    const base = { name: 'X', primary_muscle: 'chest', equipment: 'barbell' };
    expect(() => parseNewExercise({ ...base, primary_muscle: 'wings' })).toThrow(/primary_muscle/);
    expect(() => parseNewExercise({ ...base, equipment: 'rock' })).toThrow(/equipment/);
    expect(() => parseNewExercise({ ...base, log_type: 'x' })).toThrow(/log_type/);
    expect(() => parseNewExercise({ ...base, secondary_muscles: ['x'] })).toThrow(/unknown muscle/);
  });

  it('by name, whatever the case; the own one first', () => {
    const own = { id: 'mine', name: 'BENCH PRESS', log_type: 'reps', owner_id: 'u' };
    expect(findExercise(known, 'bench PRESS')?.id).toBe('bench');
    expect(findExercise([...known, own], 'bench press')?.id).toBe('mine');
  });
});

describe('past workouts', () => {
  it('the columns follow the log type of each exercise', () => {
    const w = parse({
      exercises: [
        { exercise: 'Bench press', sets: [{ weight_kg: 80.555, reps: 8, duration_s: 9 }] },
        { exercise: 'Plank', sets: [{ duration_s: 60, weight_kg: 5 }] },
        { exercise: 'Run', sets: [{ distance_m: 5000, duration_s: 1500 }] },
        { exercise: 'Pull-up', sets: [{ reps: 10 }] },
      ],
    });
    expect(w.exercises.map((e) => e.sets[0])).toEqual([
      { weight_kg: 80.56, reps: 8, drops: [] },
      { duration_s: 60, drops: [] },
      { duration_s: 1500, distance_m: 5000, drops: [] },
      { reps: 10, drops: [] },
    ]);
  });

  it('defaults: noon, no duration, "Workout"', () => {
    expect(parse({ exercises: bench([{ weight_kg: 50, reps: 5 }]) })).toMatchObject({
      name: 'Workout',
      startTime: '12:00',
      minutes: 0,
      allowSecond: false,
    });
  });

  it('the same exercise twice is one exercise with all its sets', () => {
    const w = parse({
      exercises: [
        { exercise: 'Bench press', sets: [{ weight_kg: 50, reps: 5 }] },
        { exercise_id: 'bench', sets: [{ weight_kg: 60, reps: 3 }] },
      ],
    });
    expect(w.exercises).toHaveLength(1);
    expect(pastWorkoutSets(w)).toBe(2);
  });

  it('refuses the future, a bad time, unknown exercises and incomplete sets', () => {
    const ok = bench([{ weight_kg: 50, reps: 5 }]);
    expect(() => parse({ day: '2026-11-07', exercises: ok })).toThrow(/future/);
    expect(() => parse({ day: '2026-13-01', exercises: ok })).toThrow(/date/);
    expect(() => parse({ start_time: '25:00', exercises: ok })).toThrow(/start_time/);
    expect(() => parse({ exercises: [] })).toThrow(/empty/);
    expect(() => parse({ exercises: [{ exercise: 'Nope', sets: [{}] }] })).toThrow(
      /Not found: Nope/,
    );
    expect(() => parse({ exercises: bench([]) })).toThrow(/sets must not be empty/);
    expect(() => parse({ exercises: bench([{ reps: 5 }]) })).toThrow(
      /set 1: weight_kg is required/,
    );
    expect(() => parse({ exercises: bench([{ weight_kg: 5 }]) })).toThrow(/reps is required/);
  });
});

describe('drop sets', () => {
  const dropped = {
    weight_kg: 80,
    reps: 8,
    drops: [
      { weight_kg: 60, reps: 10 },
      { weight_kg: 40, reps: 12 },
    ],
  };

  it('each drop is a row next to its set, with the same set index', () => {
    const w = parse({ exercises: bench([dropped, { weight_kg: 70, reps: 6 }]) });
    const rows = pastWorkoutRows(w, {
      sessionId: 's',
      userId: 'u',
      completedAt: 'then',
      newId: () => 'id',
    });
    expect(rows.exercises).toHaveLength(1);
    expect(rows.sets.map((r) => [r.set_index, r.drop_index, r.weight_kg, r.reps])).toEqual([
      [0, 0, 80, 8],
      [0, 1, 60, 10],
      [0, 2, 40, 12],
      [1, 0, 70, 6],
    ]);
    expect(pastWorkoutSets(w)).toBe(2);
  });

  it('only on weight and reps, at most four, each complete', () => {
    const plank = [{ exercise: 'Plank', sets: [{ duration_s: 60, drops: [dropped.drops[0]] }] }];
    expect(() => parse({ exercises: plank })).toThrow(/only for exercises with weight and reps/);
    const five = Array.from({ length: 5 }, () => dropped.drops[0]);
    expect(() => parse({ exercises: bench([{ ...dropped, drops: five }]) })).toThrow(/at most 4/);
    expect(() => parse({ exercises: bench([{ ...dropped, drops: [{ reps: 5 }] }]) })).toThrow(
      /drop 1: weight_kg is required/,
    );
  });
});

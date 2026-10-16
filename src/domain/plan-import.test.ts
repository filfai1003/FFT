import {
  buildImportPrompt,
  extractJson,
  FORMAT_EXAMPLE,
  matchExercise,
  parseBundle,
} from './plan-import';

describe('extractJson', () => {
  it('finds the object in a code block, with text around it', () => {
    const reply = 'Sure!\n```json\n{ "a": { "b": "}" } }\n```\nEnjoy.';
    expect(extractJson(reply)).toEqual({ a: { b: '}' } });
  });
  it('finds a bare object and rejects text without one', () => {
    expect(extractJson('here: {"x": 1} done')).toEqual({ x: 1 });
    expect(extractJson('no json here')).toBeNull();
    expect(extractJson('{ broken')).toBeNull();
  });
});

describe('parseBundle', () => {
  it('accepts the documented example, as text or object', () => {
    const fromText = parseBundle('```json\n' + JSON.stringify(FORMAT_EXAMPLE) + '\n```');
    expect(fromText.errors).toEqual([]);
    expect(fromText.workout?.days[0].exercises[0]).toMatchObject({
      name: 'Barbell bench press',
      sets: 4,
      reps: '6-8',
      restS: 120,
    });
    expect(fromText.diet?.meals[0]).toMatchObject({
      name: 'Breakfast',
      kcal: 35 * 4 + 70 * 4 + 12 * 9,
    });
    expect(parseBundle(FORMAT_EXAMPLE).workout?.name).toBe('Push Pull Legs');
  });

  it('cleans values: ranges, defaults, meal calories from macros, workout_after', () => {
    const r = parseBundle({
      workout_plan: {
        days: [{ exercises: [{ exercise: 'Squat', sets: 99, rest_s: -5 }, { name: '' }] }],
      },
      diet_plan: {
        daily: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 67 },
        meals: [{ name: 'Lunch', protein_g: 40, carbs_g: 60, fat_g: 10, kcal: 9999, main: true }],
        workout_after: 'lunch',
      },
    });
    expect(r.errors).toEqual([]);
    expect(r.workout).toMatchObject({ name: 'AI plan', id: null });
    expect(r.workout?.days[0]).toMatchObject({ name: 'Day 1' });
    expect(r.workout?.days[0].exercises).toEqual([
      expect.objectContaining({ name: 'Squat', sets: 20, reps: '8-12', restS: 0 }),
    ]);
    expect(r.diet?.meals[0]).toMatchObject({ isMain: true, kcal: 40 * 4 + 60 * 4 + 10 * 9 });
    expect(r.diet?.workoutAfter).toBe('Lunch');
  });

  it('refuses unsafe or empty plans and says why', () => {
    expect(
      parseBundle({
        diet_plan: {
          daily: { kcal: 1200, protein_g: 100, carbs_g: 100, fat_g: 30 },
          meals: [{ name: 'x', protein_g: 1 }],
        },
      }).errors[0],
    ).toMatch(/1500/);
    expect(parseBundle({ workout_plan: { days: [] } }).errors[0]).toMatch(/at least one day/);
    expect(parseBundle('nothing').errors).toEqual(['No JSON found in the text']);
    expect(parseBundle({ other: 1 }).errors[0]).toMatch(/workout_plan/);
  });

  it('keeps the details of a new exercise, only when they are valid', () => {
    const r = parseBundle({
      workout_plan: {
        name: 'x',
        days: [
          {
            name: 'd',
            exercises: [
              { exercise: 'Zercher squat', primary_muscle: 'legs', equipment: 'barbell' },
              { exercise: 'Mystery', primary_muscle: 'wings', equipment: 'barbell' },
            ],
          },
        ],
      },
    });
    const [a, b] = r.workout!.days[0].exercises;
    expect(a.newExercise).toEqual({
      primaryMuscle: 'legs',
      equipment: 'barbell',
      logType: 'weight_reps',
    });
    expect(b.newExercise).toBeNull();
  });
});

describe('diet modes', () => {
  it('tracking needs no meals; fixed_meals does; the mode is guessed from the meals', () => {
    const tracking = parseBundle({
      diet_plan: {
        mode: 'tracking',
        daily: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 67 },
      },
    });
    expect(tracking.errors).toEqual([]);
    expect(tracking.diet).toMatchObject({ mode: 'tracking', meals: [], workoutAfter: null });
    const noMeals = parseBundle({
      diet_plan: {
        mode: 'fixed_meals',
        daily: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 67 },
      },
    });
    expect(noMeals.errors[0]).toMatch(/at least one meal/);
    const guessed = parseBundle({
      diet_plan: {
        daily: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 67 },
        meals: [{ name: 'A', protein_g: 10 }],
      },
    });
    expect(guessed.diet?.mode).toBe('fixed_meals');
  });
});

describe('matchExercise', () => {
  const list = [
    { name: 'Barbell bench press' },
    { name: 'Incline barbell bench press' },
    { name: 'Pull-up' },
  ];
  it('matches ignoring case and punctuation, then a unique partial name', () => {
    expect(matchExercise('barbell BENCH press', list)).toBe(list[0]);
    expect(matchExercise('pull up', list)).toBe(list[2]);
    expect(matchExercise('Incline bench press barbell', list)).toBeNull();
    expect(matchExercise('bench press', list)).toBeNull(); // two partial matches: ambiguous
    expect(matchExercise('xyz', list)).toBeNull();
  });
});

describe('buildImportPrompt', () => {
  it('carries the request, the profile, the format and the exercise list', () => {
    const p = buildImportPrompt({
      request: '3 days a week',
      profile: 'goal: build muscle',
      exercises: ['Pull-up', 'Squat'],
    });
    expect(p).toContain('MY REQUEST: 3 days a week');
    expect(p).toContain('goal: build muscle');
    expect(p).toContain('"workout_plan"');
    expect(p).toContain('Pull-up, Squat');
  });
});

describe('supersets in the format', () => {
  it('reads superset_with_next, never on the last exercise of a day', () => {
    const r = parseBundle(
      JSON.stringify({
        workout_plan: {
          name: 'P',
          days: [
            {
              name: 'Arms',
              exercises: [
                { exercise: 'Barbell curl', sets: 3, reps: '10', superset_with_next: true },
                { exercise: 'Triceps pushdown', sets: 3, reps: '12', superset_with_next: true },
              ],
            },
          ],
        },
      }),
    );
    expect(r.workout?.days[0].exercises.map((e) => e.supersetWithNext)).toEqual([true, false]);
  });
});

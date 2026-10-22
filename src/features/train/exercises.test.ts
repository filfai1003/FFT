import { exerciseImageUrl, exerciseRow, toExercise } from './exercises';

describe('exercises mapping', () => {
  it('maps a database row to the app model', () => {
    expect(
      toExercise({
        id: 'e1',
        owner_id: null,
        name: 'Barbell bench press',
        primary_muscle: 'chest',
        secondary_muscles: ['front_delts', 'triceps'],
        indirect_muscles: [],
        equipment: 'barbell',
        log_type: 'weight_reps',
        image_path: 'bench-press.png',
      }),
    ).toEqual({
      id: 'e1',
      ownerId: null,
      name: 'Barbell bench press',
      primaryMuscle: 'chest',
      secondaryMuscles: ['front_delts', 'triceps'],
      indirectMuscles: [],
      equipment: 'barbell',
      logType: 'weight_reps',
      imagePath: 'bench-press.png',
    });
  });

  it('treats null muscles as empty and reads old muscle names in the new ones (DECISIONS 125)', () => {
    const e = toExercise({
      id: 'e2',
      owner_id: 'u1',
      name: 'x',
      primary_muscle: 'back',
      secondary_muscles: null,
      equipment: 'cables',
      log_type: 'reps',
      image_path: null,
    });
    expect(e.primaryMuscle).toBe('lats');
    expect(e.secondaryMuscles).toEqual(['upper_back']);
    expect(e.indirectMuscles).toEqual([]);
  });

  it('saves each muscle at one level only', () => {
    expect(
      exerciseRow(
        {
          id: 'e3',
          name: ' Zercher squat ',
          primaryMuscle: 'quads',
          secondaryMuscles: ['quads', 'glutes'],
          indirectMuscles: ['glutes', 'abs', 'quads'],
          equipment: 'barbell',
          logType: 'weight_reps',
        },
        'u1',
      ),
    ).toEqual({
      id: 'e3',
      owner_id: 'u1',
      name: 'Zercher squat',
      primary_muscle: 'quads',
      secondary_muscles: ['glutes'],
      indirect_muscles: ['abs'],
      equipment: 'barbell',
      log_type: 'weight_reps',
    });
  });

  it('builds the public image URL, or null without an image', () => {
    expect(exerciseImageUrl('http://127.0.0.1:54321/', 'bench-press.png')).toBe(
      'http://127.0.0.1:54321/storage/v1/object/public/exercise-images/bench-press.png',
    );
    expect(exerciseImageUrl('http://127.0.0.1:54321', null)).toBeNull();
  });
});

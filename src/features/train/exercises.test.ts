import { exerciseImageUrl, toExercise } from './exercises';

describe('exercises mapping', () => {
  it('maps a database row to the app model', () => {
    expect(
      toExercise({
        id: 'e1',
        owner_id: null,
        name: 'Barbell bench press',
        primary_muscle: 'chest',
        secondary_muscles: ['shoulders', 'triceps'],
        equipment: 'barbell',
        log_type: 'weight_reps',
        image_path: 'bench-press.png',
      }),
    ).toEqual({
      id: 'e1',
      ownerId: null,
      name: 'Barbell bench press',
      primaryMuscle: 'chest',
      secondaryMuscles: ['shoulders', 'triceps'],
      equipment: 'barbell',
      logType: 'weight_reps',
      imagePath: 'bench-press.png',
    });
  });

  it('treats null secondary muscles as empty', () => {
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
    expect(e.secondaryMuscles).toEqual([]);
  });

  it('builds the public image URL, or null without an image', () => {
    expect(exerciseImageUrl('http://127.0.0.1:54321/', 'bench-press.png')).toBe(
      'http://127.0.0.1:54321/storage/v1/object/public/exercise-images/bench-press.png',
    );
    expect(exerciseImageUrl('http://127.0.0.1:54321', null)).toBeNull();
  });
});

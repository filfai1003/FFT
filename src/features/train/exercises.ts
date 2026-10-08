import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

export const muscles = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'glutes',
  'abs',
] as const;
export type Muscle = (typeof muscles)[number];

export type LogType = 'weight_reps' | 'reps' | 'time' | 'distance_time';

export type Exercise = {
  id: string;
  /** null for catalogue exercises, the user id for their own. */
  ownerId: string | null;
  name: string;
  primaryMuscle: Muscle;
  secondaryMuscles: Muscle[];
  equipment: string;
  logType: LogType;
  imagePath: string | null;
};

type ExerciseRow = {
  id: string;
  owner_id: string | null;
  name: string;
  primary_muscle: Muscle;
  secondary_muscles: Muscle[] | null;
  equipment: string;
  log_type: LogType;
  image_path: string | null;
};

export function toExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    primaryMuscle: row.primary_muscle,
    secondaryMuscles: row.secondary_muscles ?? [],
    equipment: row.equipment,
    logType: row.log_type,
    imagePath: row.image_path,
  };
}

/** Public URL of a catalogue image in the `exercise-images` bucket, or null when it has none. */
export function exerciseImageUrl(baseUrl: string, imagePath: string | null): string | null {
  if (!imagePath) return null;
  return `${baseUrl.replace(/\/$/, '')}/storage/v1/object/public/exercise-images/${imagePath}`;
}

export const exerciseKeys = { all: ['exercises'] as const };

/** Catalogue + the user's own exercises (RLS decides what is visible), alphabetical. */
export function useExercises() {
  return useQuery({
    queryKey: exerciseKeys.all,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('exercises')
        .select(
          'id, owner_id, name, primary_muscle, secondary_muscles, equipment, log_type, image_path',
        )
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data as ExerciseRow[]).map(toExercise);
    },
  });
}

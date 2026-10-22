import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionStore as useAuth } from '@/features/auth/session-store';
import { getSupabase } from '@/lib/supabase';

import { muscles, normalizeMuscles, type Muscle } from '@/domain/muscles';

export { muscles };
export type { Muscle };

export type LogType = 'weight_reps' | 'reps' | 'time' | 'distance_time';

export type Exercise = {
  id: string;
  /** null for catalogue exercises, the user id for their own. */
  ownerId: string | null;
  name: string;
  /** 1 set per set done; gives the exercise its group (DECISIONS 125). */
  primaryMuscle: Muscle;
  /** Muscles that help: half a set each. */
  secondaryMuscles: Muscle[];
  /** Muscles that steady or assist a little: a quarter set each. */
  indirectMuscles: Muscle[];
  equipment: string;
  logType: LogType;
  imagePath: string | null;
};

type ExerciseRow = {
  id: string;
  owner_id: string | null;
  name: string;
  primary_muscle: string;
  secondary_muscles: string[] | null;
  indirect_muscles?: string[] | null;
  equipment: string;
  log_type: LogType;
  image_path: string | null;
};

export const EXERCISE_COLUMNS =
  'id, owner_id, name, primary_muscle, secondary_muscles, indirect_muscles, equipment, log_type, image_path';

export function toExercise(row: ExerciseRow): Exercise {
  // Read in today's 17 muscles, whatever wrote the row (the device's database maps old rows too).
  const m = normalizeMuscles({
    primary: row.primary_muscle,
    secondary: row.secondary_muscles,
    indirect: row.indirect_muscles,
  });
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    primaryMuscle: m?.primary ?? (row.primary_muscle as Muscle),
    secondaryMuscles: [...(m?.secondary ?? [])],
    indirectMuscles: [...(m?.indirect ?? [])],
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

function useAuthUser() {
  return useAuth((s) => s.userId);
}

export const exerciseKeys = { all: ['exercises'] as const };

/** Catalogue + the user's own exercises (RLS decides what is visible), alphabetical. */
export function useExercises() {
  return useQuery({
    queryKey: exerciseKeys.all,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('exercises')
        .select(EXERCISE_COLUMNS)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data as ExerciseRow[]).map(toExercise);
    },
  });
}

// --- create / edit / delete own exercises ------------------------------------------------------

export type ExerciseInput = {
  id: string;
  name: string;
  primaryMuscle: Muscle;
  secondaryMuscles: Muscle[];
  indirectMuscles: Muscle[];
  equipment: string;
  logType: LogType;
  imagePath?: string | null;
};

/** The row of an own exercise: each muscle at one level only (the database refuses anything else). */
export function exerciseRow(input: ExerciseInput, ownerId: string) {
  const secondary = input.secondaryMuscles.filter((m) => m !== input.primaryMuscle);
  return {
    id: input.id,
    owner_id: ownerId,
    name: input.name.trim(),
    primary_muscle: input.primaryMuscle,
    secondary_muscles: secondary,
    indirect_muscles: input.indirectMuscles.filter(
      (m) => m !== input.primaryMuscle && !secondary.includes(m),
    ),
    equipment: input.equipment,
    log_type: input.logType,
    ...(input.imagePath !== undefined ? { image_path: input.imagePath } : {}),
  };
}

export function useSaveExercise() {
  const userId = useAuthUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ExerciseInput) => {
      const { error } = await getSupabase().from('exercises').upsert(exerciseRow(input, userId!));
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exerciseKeys.all }),
  });
}

export function useDeleteExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase()
        .from('exercises')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exerciseKeys.all }),
  });
}

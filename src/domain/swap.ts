/**
 * Swap an exercise during a workout (DECISIONS 56): the alternatives for the same main muscle,
 * best first. Shared secondary muscles, the same way of logging and equipment the user has (where
 * they train) rank higher; the exercise itself and the others already in the workout are left out.
 */

export type SwapExercise = {
  id: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: readonly string[];
  equipment: string;
  logType: string;
};

export type TrainingLocation = 'gym' | 'home' | 'bodyweight' | null;

/** Equipment someone training there has (null = unknown: everything). */
export function equipmentAt(location: TrainingLocation): readonly string[] | null {
  if (location === 'home') return ['dumbbells', 'bodyweight', 'bands'];
  if (location === 'bodyweight') return ['bodyweight', 'bands'];
  return null;
}

export type SwapCandidate<T extends SwapExercise> = {
  exercise: T;
  /** Shares at least one secondary muscle with the one it replaces. */
  similar: boolean;
  /** Needs equipment the user does not have (listed last). */
  otherEquipment: boolean;
};

export function swapCandidates<T extends SwapExercise>(
  current: SwapExercise,
  all: readonly T[],
  inWorkout: readonly string[],
  location: TrainingLocation,
): SwapCandidate<T>[] {
  const have = equipmentAt(location);
  const taken = new Set([current.id, ...inWorkout]);
  return all
    .filter((e) => !taken.has(e.id) && e.primaryMuscle === current.primaryMuscle)
    .map((e) => {
      const shared = e.secondaryMuscles.filter((m) => current.secondaryMuscles.includes(m)).length;
      const otherEquipment = have != null && !have.includes(e.equipment);
      const score =
        (otherEquipment ? 0 : 100) +
        (e.logType === current.logType ? 20 : 0) +
        shared * 5 +
        (e.equipment !== current.equipment ? 1 : 0);
      return { exercise: e, similar: shared > 0, otherEquipment, score };
    })
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))
    .map(({ exercise, similar, otherEquipment }) => ({ exercise, similar, otherEquipment }));
}

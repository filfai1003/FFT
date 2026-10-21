import { muscles, strengthGroup, type StrengthGroup, type Muscle } from '@/domain/muscles';
import type { Exercise } from './exercises';
import type { ExerciseRecord } from './exercise-stats';
import { displayWeight, type WeightUnit } from '@/domain/units';

export type ExerciseFilter = 'all' | StrengthGroup | 'mine';

export const exerciseFilters: ExerciseFilter[] = [
  'all',
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
  'mine',
];

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function filterExercises(
  list: readonly Exercise[],
  { query, filter }: { query: string; filter: ExerciseFilter },
): Exercise[] {
  const q = fold(query.trim());
  return list.filter((e) => {
    if (filter === 'mine' && e.ownerId == null) return false;
    if (filter !== 'all' && filter !== 'mine' && strengthGroup(e.primaryMuscle) !== filter)
      return false;
    return q === '' || fold(e.name).includes(q);
  });
}

/** Sections by primary muscle, in a fixed order, empty ones dropped. */
export function groupByMuscle(list: readonly Exercise[]): { muscle: Muscle; items: Exercise[] }[] {
  return muscles
    .map((muscle) => ({
      muscle,
      items: list
        .filter((e) => e.primaryMuscle === muscle)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.items.length > 0);
}

/** "Chest · triceps · bodyweight" (picker rows; sentence case, no uppercase labels). */
export function exerciseMeta(e: Exercise): string {
  const line = [e.primaryMuscle, ...e.secondaryMuscles, e.equipment].join(' · ').toLowerCase();
  return line.charAt(0).toUpperCase() + line.slice(1);
}

export type RecordLabel =
  | { kind: 'none' }
  | { kind: 'weight'; max: string; est: string | null; unit: WeightUnit }
  | { kind: 'reps'; reps: number }
  | { kind: 'time'; seconds: number };

/** What the library shows under an exercise name: its best numbers, in the user's unit. */
export function recordLabel(
  e: Exercise,
  r: ExerciseRecord | undefined,
  unit: WeightUnit,
): RecordLabel {
  if (!r || r.completedSets === 0) return { kind: 'none' };
  if (e.logType === 'weight_reps' && r.actualMaxKg != null) {
    return {
      kind: 'weight',
      max: String(displayWeight(r.actualMaxKg, unit)),
      est: r.est1rmKg != null ? String(Math.round(displayWeight(r.est1rmKg, unit))) : null,
      unit,
    };
  }
  if (e.logType === 'reps' && r.bestReps != null) return { kind: 'reps', reps: r.bestReps };
  if (e.logType === 'time' && r.bestDurationS != null)
    return { kind: 'time', seconds: r.bestDurationS };
  return { kind: 'none' };
}

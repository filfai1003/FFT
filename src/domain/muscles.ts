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

/** Groups of the strength score: Chest, Back, Shoulders, Legs, Arms, Core. */
export const strengthGroups = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'] as const;
export type StrengthGroup = (typeof strengthGroups)[number];

/** Same mapping as the SQL function public.strength_group(). */
export function strengthGroup(muscle: Muscle): StrengthGroup {
  switch (muscle) {
    case 'biceps':
    case 'triceps':
      return 'arms';
    case 'abs':
      return 'core';
    case 'glutes':
      return 'legs';
    default:
      return muscle;
  }
}

import { calorieStatus } from '@/features/diet/summary';

/** Part of the day for the greeting (local time): 5–11 morning, 12–17 afternoon, else evening. */
export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/** The first word of the profile name ("Filippo Faiella" -> "Filippo"), or null. */
export function firstName(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first ? first.charAt(0).toLocaleUpperCase() + first.slice(1) : null;
}

/** "1 of 3 taken": only supplements still on the list count. */
export function supplementsCount(
  list: readonly { id: string }[],
  taken: ReadonlySet<string> | undefined,
): { taken: number; total: number } {
  return { taken: list.filter((s) => taken?.has(s.id)).length, total: list.length };
}

/**
 * The day's water target in whole glasses (at least one): the target itself comes from
 * `useWaterTarget` / `waterTargetForDay` (DECISIONS 127; 2 L while it is being read).
 */
export function waterGoal(glassMl: number, targetMl = 2000): { glasses: number; ml: number } {
  const glasses = Math.max(1, Math.round(targetMl / glassMl));
  return { glasses, ml: targetMl };
}

export type WorkoutToday = { kind: 'done' } | { kind: 'next'; name: string } | { kind: 'none' };

type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * The line under the greeting: today's workout and the calories left, as far as they are known
 * ("Push A today · 1,650 kcal left"). Null when there is nothing to say.
 */
export function daySummary(
  t: Translate,
  formatInt: (n: number) => string,
  input: { workout: WorkoutToday; eatenKcal: number; targetKcal: number | null },
): string | null {
  const parts: string[] = [];
  if (input.workout.kind === 'done') parts.push(t('today.summaryWorkoutDone'));
  else if (input.workout.kind === 'next')
    parts.push(t('today.summaryWorkout', { name: input.workout.name }));
  const eaten = Math.round(input.eatenKcal);
  if (input.targetKcal != null && input.targetKcal > 0) {
    const status = calorieStatus(input.eatenKcal, input.targetKcal);
    parts.push(
      status.over
        ? t('today.summaryKcalOver', { kcal: formatInt(status.amount) })
        : t('today.summaryKcalLeft', { kcal: formatInt(status.amount) }),
    );
  } else if (eaten > 0) parts.push(t('today.summaryKcalEaten', { kcal: formatInt(eaten) }));
  return parts.length ? parts.join(' · ') : null;
}

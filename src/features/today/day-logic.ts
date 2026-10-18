import { addDays } from '@/domain/day';
import type { Goal } from '@/domain/nutrition';

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

/** Below this the weight has not moved (scale noise, one decimal shown). */
const FLAT_KG = 0.05;
/** Maintaining: a week's change within this counts as on goal. */
const MAINTAIN_KG = 0.3;

export type WeightTrend = {
  /** Latest minus the weight a week (or more) before. */
  change: number;
  direction: 'up' | 'down' | 'flat';
  /** The change goes the way of the profile goal (green); otherwise neutral, never red. */
  towardGoal: boolean;
};

type WeightEntry = { day: string; weightKg: number | null };

/**
 * How the weight moved this week: the latest weigh-in against the last one at least 7 days
 * before it. Lose fat: down is toward the goal; build muscle: up; maintain (or no goal): staying
 * within 0.3 kg. Null without two such weigh-ins. Entries come newest first.
 */
export function weightTrend(
  entries: readonly WeightEntry[],
  today: string,
  goal: Goal | string | null | undefined,
): WeightTrend | null {
  const weights = entries.filter((e) => e.weightKg != null);
  const latest = weights[0];
  const weekAgo = weights.find((e) => e.day <= addDays(today, -7));
  if (latest?.weightKg == null || weekAgo?.weightKg == null || latest === weekAgo) return null;
  const change = latest.weightKg - weekAgo.weightKg;
  const direction = Math.abs(change) < FLAT_KG ? 'flat' : change > 0 ? 'up' : 'down';
  const towardGoal =
    goal === 'lose_fat'
      ? direction === 'down'
      : goal === 'build_muscle'
        ? direction === 'up'
        : Math.abs(change) <= MAINTAIN_KG;
  return { change, direction, towardGoal };
}

/** The weigh-ins of the last `days` days, oldest first (for the small line). */
export function weightLine(entries: readonly WeightEntry[], today: string, days = 28): number[] {
  return entries
    .filter((e) => e.weightKg != null && e.day > addDays(today, -days))
    .map((e) => e.weightKg as number)
    .reverse();
}

/** "1 of 3 taken": only supplements still on the list count. */
export function supplementsCount(
  list: readonly { id: string }[],
  taken: ReadonlySet<string> | undefined,
): { taken: number; total: number } {
  return { taken: list.filter((s) => taken?.has(s.id)).length, total: list.length };
}

/** The daily water goal: about 2 litres in whole glasses. */
export function waterGoal(glassMl: number): { glasses: number; ml: number } {
  const glasses = Math.max(1, Math.round(2000 / glassMl));
  return { glasses, ml: glasses * glassMl };
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
    const left = Math.round(input.targetKcal) - eaten;
    parts.push(
      left >= 0
        ? t('today.summaryKcalLeft', { kcal: formatInt(left) })
        : t('today.summaryKcalOver', { kcal: formatInt(-left) }),
    );
  } else if (eaten > 0) parts.push(t('today.summaryKcalEaten', { kcal: formatInt(eaten) }));
  return parts.length ? parts.join(' · ') : null;
}

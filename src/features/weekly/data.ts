import { goalForDay, hasTarget } from '@/domain/diet';
import { buildWeeklySummary, type WeeklySummary } from '@/domain/weekly-summary';
import { useGoals } from '@/features/diet/log';
import { useActivity } from '@/features/gamification/data';
import { useToday } from '@/features/profile/use-today';
import { useBodyEntries } from '@/features/progress/data';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useActivePlan } from '@/features/train/plans';

/**
 * The weekly summary of the week holding `day` (this week by default), from the device's data:
 * the same activity as the gamification, the weights and the active plan. Null while loading.
 */
export function useWeeklySummary(day?: string): {
  summary: WeeklySummary | null;
  /** The user has a calorie target (else "days on target" is left out). */
  dietTracked: boolean;
} {
  const today = useToday();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const activity = useActivity();
  const entries = useBodyEntries();
  const { plan, isPending: planPending } = useActivePlan();
  const goals = useGoals();
  const dietTracked = hasTarget(goalForDay(goals.data ?? [], today));
  if (!activity.data || !entries.data || planPending) return { summary: null, dietTracked };
  const summary = buildWeeklySummary({
    day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today ? day : today,
    today,
    weekStart,
    activity: activity.data,
    planDays: plan?.days.length ?? null,
    weights: entries.data
      .filter((e) => e.weightKg != null)
      .map((e) => ({ day: e.day, kg: e.weightKg as number })),
  });
  return { summary, dietTracked };
}

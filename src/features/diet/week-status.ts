import { useQuery } from '@tanstack/react-query';
import { dietDayStatus, goalForDay, targetForDay, type Goal } from '@/domain/diet';
import { getSupabase } from '@/lib/supabase';
import { useGoals, useTrainedDays } from './log';

/**
 * What the dot under a day of the Diet strip says (DECISIONS 112): on target, off target,
 * logged (today so far, or a day without a target), nothing logged, or nothing to say (future).
 */
export type StripDayStatus = 'onTarget' | 'off' | 'logged' | 'none' | 'future';

/** Pure: the status of each day from its calories, its target and whether it is over. */
export function stripStatuses(
  days: readonly string[],
  today: string,
  kcalByDay: ReadonlyMap<string, number>,
  goals: readonly (Goal & { validFrom: string })[],
  trained: ReadonlySet<string>,
): Record<string, StripDayStatus> {
  const out: Record<string, StripDayStatus> = {};
  for (const day of days) {
    if (day > today) {
      out[day] = 'future';
      continue;
    }
    const kcal = kcalByDay.get(day) ?? 0;
    if (kcal <= 0) {
      out[day] = 'none';
      continue;
    }
    const target = targetForDay(goalForDay(goals, day), trained.has(day));
    // Today is not over yet: "logged", never a discouraging "off target" at lunch.
    if (!target || day === today) {
      out[day] = 'logged';
      continue;
    }
    out[day] = dietDayStatus(kcal, target.kcal) === 'onTarget' ? 'onTarget' : 'off';
  }
  return out;
}

async function fetchKcalByDay(from: string, to: string) {
  const { data, error } = await getSupabase()
    .from('daily_nutrition_totals')
    .select('day, kcal')
    .gte('day', from)
    .lte('day', to);
  if (error) throw error;
  return new Map(
    (data as { day: string; kcal: number | string }[]).map((r) => [r.day, Number(r.kcal)]),
  );
}

/** The strip's statuses for a week (refreshed with every diet change: the key is under 'diet'). */
export function useStripStatuses(days: readonly string[], today: string) {
  const from = days[0];
  const to = days[days.length - 1];
  const totals = useQuery({
    queryKey: ['diet', 'week', from, to] as const,
    queryFn: () => fetchKcalByDay(from, to),
  });
  const goals = useGoals();
  const trained = useTrainedDays(from, to);
  if (!totals.data || !goals.data) return null;
  return stripStatuses(days, today, totals.data, goals.data, trained.data ?? new Set());
}

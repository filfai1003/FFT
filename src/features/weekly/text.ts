import { displayWeight, type WeightUnit } from '@/domain/units';
import type { WeeklySummary } from '@/domain/weekly-summary';
import type { Translate } from '@/i18n';

/** "−0.4 kg" (true minus sign), in the user's unit. */
export function weightChangeText(deltaKg: number, unit: WeightUnit): string {
  const v = displayWeight(Math.abs(deltaKg), unit);
  const sign = deltaKg > 0 ? '+' : deltaKg < 0 ? '−' : '';
  return `${sign}${v.toFixed(1)} ${unit}`;
}

/**
 * The weekly summary in one line, as the Sunday notification says it: "4 workouts · 5 days on
 * target · −0.4 kg". Diet only with a calorie target, weight only with a change.
 */
export function weeklyLine(
  s: WeeklySummary,
  t: Translate,
  unit: WeightUnit,
  dietTracked: boolean,
): string {
  const parts = [t('weekly.line.workouts', { count: s.workouts })];
  if (dietTracked) parts.push(t('weekly.line.onTarget', { count: s.dietOnTarget }));
  if (s.weight?.deltaKg != null) parts.push(weightChangeText(s.weight.deltaKg, unit));
  return parts.join(' · ');
}

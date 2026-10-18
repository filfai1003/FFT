import type { DietDayStatus } from '@/domain/diet';

/**
 * The mark under a day of Home's week strip (same meaning as the calendar's diet dot, its shape
 * tells the state, never the colour alone):
 * - `full`: a filled dot, the diet was on target that day;
 * - `ring`: an empty ring, the diet was off target (a past day only);
 * - `today`: today, not judged yet (the day is not over) unless already on target;
 * - `none`: no target that day, or a day still to come.
 */
export type WeekDotShape = 'full' | 'ring' | 'today' | 'none';

export function weekDotShape(status: DietDayStatus, isToday: boolean): WeekDotShape {
  if (status === 'onTarget') return 'full';
  if (isToday) return 'today';
  return status === 'off' ? 'ring' : 'none';
}

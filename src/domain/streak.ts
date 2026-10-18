import { addDays } from './day';

/**
 * Current logging streak: consecutive days, up to today, with something logged. Today still
 * counts as "in progress": when nothing is logged yet today, the streak runs up to yesterday,
 * so it only breaks once a whole day passes with nothing logged.
 */
export function loggingStreak(loggedDays: ReadonlySet<string>, today: string): number {
  let day = loggedDays.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (loggedDays.has(day)) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
}

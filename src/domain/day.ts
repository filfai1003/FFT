/** The user's LOCAL date as YYYY-MM-DD in the given IANA time zone (the `day` column). */
export function localDay(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Adds days to a YYYY-MM-DD date (calendar arithmetic, no time zone involved). */
export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}

/** The 7 days (Monday or Sunday first) of the week containing `day`. */
export function weekOf(day: string, weekStart: 'mon' | 'sun'): string[] {
  const [y, m, d] = day.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const offset = weekStart === 'mon' ? (dow + 6) % 7 : dow;
  const first = addDays(day, -offset);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

/** "THU OCT 08" (label style of the Today header). Day names are data, not UI copy. */
export function shortDateLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[dow]} ${MONTHS[m - 1]} ${String(d).padStart(2, '0')}`;
}

export function weekdayLetter(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()][0];
}

export function dayOfMonth(day: string): number {
  return Number(day.slice(8, 10));
}

export function monthYearLabel(day: string): string {
  const m = Number(day.slice(5, 7));
  return `${MONTHS[m - 1]} ${day.slice(0, 4)}`;
}

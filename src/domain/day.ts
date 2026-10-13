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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** "Thu 8 Oct" (the date over the Home title). Day names are data, not UI copy. */
export function shortDateLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[dow]} ${d} ${MONTHS[m - 1]}`;
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
  return `${MONTH_NAMES[m - 1]} ${day.slice(0, 4)}`;
}

export type RelativeDay =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'daysAgo'; days: number }
  | { kind: 'date'; label: string };

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** "today", "yesterday", "3 days ago" within a week, otherwise "5 Oct". */
export function relativeDay(day: string, today: string): RelativeDay {
  const diff = daysBetween(day, today);
  if (diff <= 0) return { kind: 'today' };
  if (diff === 1) return { kind: 'yesterday' };
  if (diff < 7) return { kind: 'daysAgo', days: diff };
  const label = shortDateLabel(day).split(' ').slice(1).join(' ');
  return { kind: 'date', label };
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** English weekday name of a YYYY-MM-DD date. */
export function weekdayName(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

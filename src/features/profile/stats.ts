import { useQuery } from '@tanstack/react-query';
import { addDays, deviceTimeZone, localDay } from '@/domain/day';
import { loggingStreak } from '@/domain/streak';
import { getSupabase } from '@/lib/supabase';
import { useProfile } from './api';
import { useToday } from './use-today';

/** How far back the streak looks (a longer streak shows as this many days). */
const LOOKBACK_DAYS = 400;

/**
 * Days with anything logged (food, a finished workout, a weight or body entry), read from the
 * device's own database.
 */
async function fetchLoggedDays(from: string, tz: string): Promise<Set<string>> {
  const db = getSupabase();
  const [food, body, sessions] = await Promise.all([
    db.from('food_logs').select('day').gte('day', from).is('deleted_at', null),
    db.from('body_metrics').select('day').gte('day', from).is('deleted_at', null),
    db
      .from('workout_sessions')
      .select('started_at')
      .eq('status', 'done')
      .is('deleted_at', null)
      .gte('started_at', new Date(`${addDays(from, -1)}T00:00:00Z`).toISOString()),
  ]);
  if (food.error) throw food.error;
  if (body.error) throw body.error;
  if (sessions.error) throw sessions.error;
  const days = new Set<string>();
  for (const r of food.data as { day: string }[]) days.add(r.day);
  for (const r of body.data as { day: string }[]) days.add(r.day);
  for (const r of sessions.data as { started_at: string }[]) {
    days.add(localDay(new Date(r.started_at), tz));
  }
  return days;
}

/** The personal profile's numbers: logging streak and the days logged this month. */
export function useProfileStats() {
  const today = useToday();
  const tz = useProfile().data?.timezone ?? deviceTimeZone();
  const from = addDays(today, -LOOKBACK_DAYS);
  return useQuery({
    queryKey: ['profile', 'stats', today, tz],
    queryFn: async () => {
      const days = await fetchLoggedDays(from, tz);
      const month = today.slice(0, 7);
      const daysSoFar = Number(today.slice(8, 10));
      const loggedThisMonth = [...days].filter((d) => d.startsWith(month) && d <= today).length;
      return { streak: loggingStreak(days, today), loggedThisMonth, daysSoFar };
    },
  });
}

import { deviceTimeZone, localDay } from '@/domain/day';
import { useNow } from '@/lib/use-now';
import { useProfile } from './api';

/** The user's local date (YYYY-MM-DD) in their profile time zone; rolls over at midnight. */
export function useToday(): string {
  const profile = useProfile();
  const timeZone = profile.data?.timezone ?? deviceTimeZone();
  const now = useNow(30_000);
  return localDay(new Date(now), timeZone);
}

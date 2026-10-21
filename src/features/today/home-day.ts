import { createContext, useContext } from 'react';
import { useToday } from '@/features/profile/use-today';

/**
 * The day Home shows (DECISIONS 123): today, or a past day picked on the row of days or in the
 * calendar. Null = today, so the page follows midnight by itself.
 */
export const HomeDayContext = createContext<string | null>(null);

/** The shown day, today, and whether the shown day is in the past (cards that cannot act on it say so). */
export function useHomeDay(): { day: string; today: string; past: boolean } {
  const today = useToday();
  const picked = useContext(HomeDayContext);
  const day = picked && picked < today ? picked : today;
  return { day, today, past: day < today };
}

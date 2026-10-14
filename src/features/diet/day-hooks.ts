import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { targetForDay } from '@/domain/diet';
import { useToday } from '@/features/profile/use-today';
import { useGoalForDay, useTrainedDays } from './log';

/**
 * The day being looked at: today by default, or the `day` the page was opened with (the
 * calendar's "Edit nutrition"), then whatever the user picks. A newer link wins over a pick.
 */
export function useDietDay() {
  const today = useToday();
  const { day: linked } = useLocalSearchParams<{ day?: string }>();
  const [picked, setPicked] = useState<{ link: string | undefined; day: string } | null>(null);
  const fromLink = linked && /^\d{4}-\d{2}-\d{2}$/.test(linked) ? linked : null;
  const chosen = picked && picked.link === linked ? picked.day : (fromLink ?? today);
  const day = chosen <= today ? chosen : today;
  const setDay = (d: string) => setPicked({ link: linked, day: d });
  return { day, today, setDay };
}

/** Target of a day, with the training-day bonus when a workout was logged that day. */
export function useDayTarget(day: string) {
  const goal = useGoalForDay(day);
  const trained = useTrainedDays(day, day);
  return goal ? targetForDay(goal, trained.data?.has(day) ?? false) : null;
}

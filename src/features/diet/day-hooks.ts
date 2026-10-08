import { useState } from 'react';
import { targetForDay } from '@/domain/diet';
import { useToday } from '@/features/profile/use-today';
import { useGoalForDay, useTrainedDays } from './log';

/** The day being looked at (today by default) and the setter used by the calendar. */
export function useDietDay() {
  const today = useToday();
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && picked <= today ? picked : today;
  return { day, today, setDay: setPicked };
}

/** Target of a day, with the training-day bonus when a workout was logged that day. */
export function useDayTarget(day: string) {
  const goal = useGoalForDay(day);
  const trained = useTrainedDays(day, day);
  return goal ? targetForDay(goal, trained.data?.has(day) ?? false) : null;
}

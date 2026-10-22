import { deviceTimeZone, localDay } from '@/domain/day';
import { nextStreakTarget } from '@/domain/gamification';
import { DEFAULT_WATER_ML } from '@/domain/hydration';
import { useDayTarget } from '@/features/diet/day-hooks';
import { useDayTotals, useWater } from '@/features/diet/log';
import { useWaterTarget } from '@/features/diet/water-target';
import { useGamification } from '@/features/gamification/data';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { useMonthSessions } from '@/features/train/history';
import { useActivePlan, useRotation } from '@/features/train/plans';
import { type WorkoutToday } from './day-logic';

/**
 * Today's workouts already done, the plan and the day up next (Home workout card, greeting).
 * `day` = a past day shown on Home: the workouts done that day.
 */
export function useTodayWorkout(day?: string) {
  const now = useToday();
  const today = day ?? now;
  const profile = useProfile();
  const { plan } = useActivePlan();
  const rotation = useRotation(plan);
  const tz = profile.data?.timezone ?? deviceTimeZone();
  const monthSessions = useMonthSessions(today.slice(0, 7));
  const doneToday = (monthSessions.data ?? []).filter(
    (s) => localDay(new Date(s.startedAt), tz) === today,
  );
  const upNext = plan?.days.find((d) => d.id === rotation?.state.upNextDayId) ?? plan?.days[0];
  const state: WorkoutToday =
    doneToday.length > 0
      ? { kind: 'done' }
      : plan && upNext
        ? { kind: 'next', name: upNext.name }
        : { kind: 'none' };
  return { plan, rotation, upNext, doneToday, state };
}

/** What the greeting line and the day rings show: calories, workout, water and streak. */
export function useDayStatus() {
  const today = useToday();
  const totals = useDayTotals(today);
  const target = useDayTarget(today);
  const water = useWater(today);
  const { target: waterTarget } = useWaterTarget(today);
  const game = useGamification();
  const { state: workout } = useTodayWorkout();
  const streak = game?.streak ?? 0;
  return {
    eatenKcal: totals.data?.kcal ?? 0,
    targetKcal: target?.kcal ?? null,
    workout,
    waterMl: water.data?.totalMl ?? 0,
    waterGoalMl: waterTarget?.ml ?? DEFAULT_WATER_ML,
    streak,
    streakTarget: nextStreakTarget(streak),
  };
}

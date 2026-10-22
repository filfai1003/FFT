import { computeGamification, nextStreakTarget } from '@/domain/gamification';
import { inputOf, type Activity, type GameData } from '@/features/gamification/data';

/**
 * Streak and badges for the workout summary. The workout just finished is written to the device
 * database a moment after the summary opens, so it is counted here even if the activity read
 * does not have it yet (never twice: workouts are matched by id).
 */
export function gameWithWorkout(
  activity: Activity,
  workout: { id: string; day: string; hour: number; planId: string | null },
  today: string,
): GameData & { nextStreak: number | null } {
  const has = activity.workouts.some((w) => w.id === workout.id);
  const withIt: Activity = has
    ? activity
    : {
        ...activity,
        workouts: [...activity.workouts, workout],
        loggedDays: new Set([...activity.loggedDays, workout.day]),
      };
  const game = computeGamification(inputOf(withIt, today));
  return { ...game, activity: withIt, nextStreak: nextStreakTarget(game.streak) };
}

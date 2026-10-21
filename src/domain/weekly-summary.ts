import { addDays, weekOf } from './day';
import {
  badgeStates,
  elapsedDays,
  nextBadges,
  personalRecords,
  type BadgeState,
  type GamificationInput,
  type PersonalRecord,
} from './gamification';
import { loggingStreak } from './streak';

/**
 * The weekly summary (DECISIONS 122): one week of the user's own log, for the Sunday notification
 * and the "Your week" page. Pure, derived like the gamification (89): nothing is stored.
 */

export type WeeklySummaryInput = {
  /** Any day of the week to sum up. */
  day: string;
  today: string;
  weekStart: 'mon' | 'sun';
  /** The gamification's input without `today` (loggedDays, workouts, diet days, records…). */
  activity: Omit<GamificationInput, 'today'>;
  /** Days of the active plan (planned once a week); null without a plan. */
  planDays: number | null;
  /** Weights logged, oldest first (kg). */
  weights: readonly { day: string; kg: number }[];
};

export type WeeklySummary = {
  from: string;
  to: string;
  /** The last day counted: the week's end, or today in the current week. */
  asOf: string;
  isCurrent: boolean;
  /** Days of the week passed (today included). */
  daysPassed: number;
  workouts: number;
  /** Days of the week with a workout. */
  trainedDays: string[];
  planned: number | null;
  dietOnTarget: number;
  dietDays: string[];
  /** Weight at the end of the week against the last one before it (or the week's first). */
  weight: { endKg: number; startKg: number | null; deltaKg: number | null } | null;
  /** The streak at the end of the week (today in the current week). */
  streak: number;
  badgesEarned: BadgeState[];
  /** The 3 unearned badges closest to done. */
  closestBadges: BadgeState[];
  /** The record of the week with the biggest gain (a max record first on a tie). */
  bestRecord: PersonalRecord | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildWeeklySummary(input: WeeklySummaryInput): WeeklySummary {
  const week = weekOf(input.day, input.weekStart);
  const from = week[0]!;
  const to = week[6]!;
  const isCurrent = input.today >= from && input.today <= to;
  const asOf = isCurrent ? input.today : to < input.today ? to : from;
  const inWeek = (d: string) => d >= from && d <= asOf;

  const workouts = input.activity.workouts.filter((w) => inWeek(w.day));
  const trainedDays = [...new Set(workouts.map((w) => w.day))].sort();
  const dietDays = [...input.activity.dietOnTargetDays].filter(inWeek).sort();

  const weekWeights = input.weights.filter((w) => inWeek(w.day));
  const before = input.weights.filter((w) => w.day < from).at(-1);
  const last = weekWeights.at(-1);
  const startKg = before?.kg ?? (weekWeights.length > 1 ? weekWeights[0]!.kg : null);
  const weight = last
    ? { endKg: last.kg, startKg, deltaKg: startKg == null ? null : round1(last.kg - startKg) }
    : null;

  const game: GamificationInput = { ...input.activity, today: asOf };
  const badges = badgeStates(game);
  const records = personalRecords(input.activity.exerciseDays, asOf).filter((r) => inWeek(r.day));
  const bestRecord =
    [...records].sort(
      (a, b) => b.pct - a.pct || (a.kind === 'max' ? -1 : 0) - (b.kind === 'max' ? -1 : 0),
    )[0] ?? null;

  return {
    from,
    to,
    asOf,
    isCurrent,
    daysPassed: Math.min(7, elapsedDays(from, asOf)),
    workouts: workouts.length,
    trainedDays,
    planned: input.planDays && input.planDays > 0 ? input.planDays : null,
    dietOnTarget: dietDays.length,
    dietDays,
    weight,
    streak: loggingStreak(input.activity.loggedDays, asOf),
    badgesEarned: badges.filter((b) => b.earnedOn != null && inWeek(b.earnedOn)),
    closestBadges: nextBadges(badges, 3),
    bestRecord,
  };
}

/** The first day of the week before / after. */
export const shiftWeek = (from: string, weeks: number) => addDays(from, 7 * weeks);

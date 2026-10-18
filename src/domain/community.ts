import { addDays, daysBetween } from './day';
import type { Muscle } from './muscles';
import { exerciseChanges, groupScores, weightedScore, type DailyE1rm } from './progress';

/**
 * Community scores (DECISIONS 90): the only numbers that leave the device when the user joins.
 * Relative, so anyone can win: workouts done, % of days on the diet target, % of planned workouts
 * done, % change of the estimated 1RM (the strength score rule: exercises done on ≥ 2 days).
 */

export type CommunityPeriod = 'week' | 'month';
export type CommunityMetric = 'workouts' | 'diet' | 'training' | 'strength';
export const communityMetrics: readonly CommunityMetric[] = [
  'workouts',
  'diet',
  'training',
  'strength',
];

export type CommunityScore = {
  period: CommunityPeriod;
  period_start: string;
  metric: CommunityMetric;
  /** '' = overall; 'group:chest'; 'exercise:<id>' (strength only). */
  subject: string;
  value: number;
};

/** Weeks start on Monday for everyone (one leaderboard per week, whatever the phone's setting). */
export function communityPeriodStart(period: CommunityPeriod, day: string): string {
  if (period === 'month') return `${day.slice(0, 7)}-01`;
  const [y, m, d] = day.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

/** Last day of the period that starts on `start`. */
export function communityPeriodEnd(period: CommunityPeriod, start: string): string {
  if (period === 'week') return addDays(start, 6);
  const [y, m] = start.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Days left after today in the period ("18 days left"). */
export function daysLeft(period: CommunityPeriod, today: string): number {
  return daysBetween(today, communityPeriodEnd(period, communityPeriodStart(period, today)));
}

export type ScoreInput = {
  today: string;
  workouts: readonly { day: string; planId: string | null }[];
  dietOnTargetDays: ReadonlySet<string>;
  daily: readonly DailyE1rm[];
  /** Days in the active plan (0 = no plan: no training score). */
  planDays: number;
  muscleOf: (exerciseId: string) => Muscle | undefined;
  /** Exercises with their own strength board (the most trained ones). */
  maxExercises?: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** This week's and this month's scores, ready for `community_submit`. */
export function communityScores(input: ScoreInput): CommunityScore[] {
  const out: CommunityScore[] = [];
  for (const period of ['week', 'month'] as const) {
    const start = communityPeriodStart(period, input.today);
    const elapsed = daysBetween(start, input.today) + 1;
    const inPeriod = (d: string) => d >= start && d <= input.today;
    const push = (metric: CommunityMetric, value: number, subject = '') =>
      out.push({ period, period_start: start, metric, subject, value });

    // At most 2 a day count (the server refuses more).
    const perDay = new Map<string, number>();
    for (const w of input.workouts)
      if (inPeriod(w.day)) perDay.set(w.day, Math.min(2, (perDay.get(w.day) ?? 0) + 1));
    push(
      'workouts',
      [...perDay.values()].reduce((a, n) => a + n, 0),
    );

    // Days passed before today, plus today once it is on target (today is not over yet).
    const onTarget = [...input.dietOnTargetDays].filter(inPeriod);
    const days = elapsed - 1 + (input.dietOnTargetDays.has(input.today) ? 1 : 0);
    push('diet', days > 0 ? round1((100 * onTarget.length) / days) : 0);

    if (input.planDays > 0) {
      // A plan of N days is planned once a week: N per 7 days passed (at least one).
      const planned = Math.max(1, Math.round((input.planDays * elapsed) / 7));
      const done = input.workouts.filter((w) => w.planId != null && inPeriod(w.day)).length;
      push('training', Math.min(100, round1((100 * done) / planned)));
    }

    const changes = exerciseChanges(input.daily, start, input.today);
    const overall = weightedScore(changes);
    if (overall != null) {
      push('strength', clamp(overall, -50, 50));
      for (const g of groupScores(changes, input.muscleOf))
        push('strength', clamp(g.pctChange, -50, 50), `group:${g.group}`);
      for (const c of [...changes]
        .sort((a, b) => b.sets - a.sets)
        .slice(0, input.maxExercises ?? 12))
        push('strength', clamp(c.pctChange, -50, 50), `exercise:${c.exerciseId}`);
    }
  }
  return out;
}

/** "Up 3", "Down 1", "Same place" from the place yesterday and now (lower is better). */
export function movement(
  place: number,
  before: number,
): { kind: 'up' | 'down' | 'same'; n: number } {
  if (before > place) return { kind: 'up', n: before - place };
  if (before < place) return { kind: 'down', n: place - before };
  return { kind: 'same', n: 0 };
}

/** "Top 12%" from a place among a total. */
export function topPercent(place: number, total: number): number {
  return Math.max(1, Math.ceil((100 * place) / Math.max(1, total)));
}

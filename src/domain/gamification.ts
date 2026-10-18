import { addDays, daysBetween, weekOf } from './day';
import { loggingStreak } from './streak';

/**
 * Personal gamification (DECISIONS 89): streaks, XP and levels, personal records and badges, all
 * DERIVED from what the user logged. Nothing here is stored: the same data always gives the same
 * level, records and badges, on every device. Pure functions, no clock: callers pass `today`.
 */

// --- inputs ------------------------------------------------------------------------------------

/** A finished workout with at least one completed set (an empty "finished" workout counts for nothing). */
export type WorkoutDay = { id: string; day: string; /** Local start hour, 0–23. */ hour: number };

/** One exercise on one day: best completed weight and best Epley estimate (main sets only). */
export type ExerciseDay = {
  exerciseId: string;
  day: string;
  bestWeightKg: number | null;
  bestE1rmKg: number | null;
};

export type GamificationInput = {
  today: string;
  /** Days with anything logged: food, a finished workout or a body entry (the streak's days). */
  loggedDays: ReadonlySet<string>;
  workouts: readonly WorkoutDay[];
  /** Days whose calories were within 10 % of the target (`dietDayStatus` = 'onTarget'). */
  dietOnTargetDays: ReadonlySet<string>;
  /** Days with a body entry (weight, body fat or a measurement). */
  checkInDays: ReadonlySet<string>;
  exerciseDays: readonly ExerciseDay[];
};

// --- streak ------------------------------------------------------------------------------------

/** Longest run of consecutive logged days, up to today (future days are ignored). */
export function bestStreak(loggedDays: ReadonlySet<string>, today: string): number {
  const days = [...loggedDays].filter((d) => d <= today).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev != null && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export type WeekDayState = 'done' | 'missed' | 'today' | 'future';

/** This week's days for the streak ring: logged, missed, today (not logged yet) or still to come. */
export function streakWeek(
  loggedDays: ReadonlySet<string>,
  today: string,
  weekStart: 'mon' | 'sun',
): { day: string; state: WeekDayState }[] {
  return weekOf(today, weekStart).map((day) => ({
    day,
    state: loggedDays.has(day)
      ? day <= today
        ? 'done'
        : 'future'
      : day === today
        ? 'today'
        : day < today
          ? 'missed'
          : 'future',
  }));
}

/** The day each streak length was first reached (index n-1 = first day with a streak of n). */
function streakMilestones(loggedDays: ReadonlySet<string>, today: string): string[] {
  const days = [...loggedDays].filter((d) => d <= today).sort();
  const firstReached: string[] = [];
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev != null && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > firstReached.length) firstReached.push(d);
    prev = d;
  }
  return firstReached;
}

// --- records -----------------------------------------------------------------------------------

export type PersonalRecord = {
  exerciseId: string;
  day: string;
  /** 'max' = heaviest completed weight; 'est1rm' = best Epley estimate. */
  kind: 'max' | 'est1rm';
  valueKg: number;
  previousKg: number;
  deltaKg: number;
  /** % gain over the previous best, one decimal. */
  pct: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Every record ever set, oldest first: a day whose best weight (or estimate) beats every earlier
 * day of the same exercise. The first day of an exercise is not a record (nothing to beat), the
 * same rule as the workout summary (`detectRecords`).
 */
export function personalRecords(rows: readonly ExerciseDay[], today: string): PersonalRecord[] {
  const byExercise = new Map<string, ExerciseDay[]>();
  for (const r of rows) {
    if (r.day > today) continue;
    byExercise.set(r.exerciseId, [...(byExercise.get(r.exerciseId) ?? []), r]);
  }
  const out: PersonalRecord[] = [];
  for (const [exerciseId, list] of byExercise) {
    const sorted = [...list].sort((a, b) => a.day.localeCompare(b.day));
    let max: number | null = null;
    let est: number | null = null;
    for (const r of sorted) {
      const w = r.bestWeightKg != null && r.bestWeightKg > 0 ? r.bestWeightKg : null;
      const e = r.bestE1rmKg != null && r.bestE1rmKg > 0 ? r.bestE1rmKg : null;
      if (w != null && max != null && w > max) out.push(record(exerciseId, r.day, 'max', w, max));
      if (e != null && est != null && e > est)
        out.push(record(exerciseId, r.day, 'est1rm', e, est));
      if (w != null) max = max == null ? w : Math.max(max, w);
      if (e != null) est = est == null ? e : Math.max(est, e);
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.exerciseId.localeCompare(b.exerciseId));
}

function record(
  exerciseId: string,
  day: string,
  kind: 'max' | 'est1rm',
  valueKg: number,
  previousKg: number,
): PersonalRecord {
  return {
    exerciseId,
    day,
    kind,
    valueKg: round1(valueKg),
    previousKg: round1(previousKg),
    deltaKg: round1(valueKg - previousKg),
    pct: round1(((valueKg - previousKg) / previousKg) * 100),
  };
}

/** Record days: one per exercise and day, whatever kinds were beaten (what badges and XP count). */
export function recordDays(
  records: readonly PersonalRecord[],
): { exerciseId: string; day: string }[] {
  const seen = new Set<string>();
  const out: { exerciseId: string; day: string }[] = [];
  for (const r of records) {
    const key = `${r.exerciseId}|${r.day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ exerciseId: r.exerciseId, day: r.day });
  }
  return out;
}

/**
 * The newest record of each exercise since `from`, newest first: the "New records" cards. A max
 * record is preferred over an estimate on the same day (the weight people remember).
 */
export function latestRecords(
  records: readonly PersonalRecord[],
  from: string,
  limit = 10,
): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>();
  for (const r of records) {
    if (r.day < from) continue;
    const cur = best.get(r.exerciseId);
    if (!cur || r.day > cur.day || (r.day === cur.day && r.kind === 'max' && cur.kind !== 'max'))
      best.set(r.exerciseId, r);
  }
  return [...best.values()]
    .sort((a, b) => b.day.localeCompare(a.day) || b.pct - a.pct)
    .slice(0, limit);
}

// --- XP and levels -----------------------------------------------------------------------------

/**
 * XP per day (DECISIONS 89). Each source counts at most once a day (PRs up to 3), and a day gives
 * at most DAILY_XP_CAP, so logging more of the same never earns more: two workouts or five
 * weigh-ins on one day are worth one. Badges add their own XP once, when earned.
 */
export const XP = {
  loggedDay: 5,
  workout: 50,
  dietOnTarget: 20,
  checkIn: 10,
  record: 10,
  recordsPerDay: 3,
} as const;
export const DAILY_XP_CAP = 100;

/** XP of each day up to today (badge XP not included). */
export function dailyXp(input: GamificationInput): Map<string, number> {
  const { today } = input;
  const perDay = new Map<string, number>();
  const add = (day: string, n: number) => {
    if (day > today) return;
    perDay.set(day, (perDay.get(day) ?? 0) + n);
  };
  for (const d of input.loggedDays) add(d, XP.loggedDay);
  for (const d of new Set(input.workouts.map((w) => w.day))) add(d, XP.workout);
  for (const d of input.dietOnTargetDays) add(d, XP.dietOnTarget);
  for (const d of input.checkInDays) add(d, XP.checkIn);
  const prsPerDay = new Map<string, number>();
  for (const r of recordDays(personalRecords(input.exerciseDays, today)))
    prsPerDay.set(r.day, (prsPerDay.get(r.day) ?? 0) + 1);
  for (const [d, n] of prsPerDay) add(d, XP.record * Math.min(XP.recordsPerDay, n));
  for (const [d, n] of perDay) perDay.set(d, Math.min(DAILY_XP_CAP, n));
  return perDay;
}

/** Total XP needed to REACH a level: 0 for level 1, then each level asks 50 XP more than the last. */
export function xpForLevel(level: number): number {
  const n = Math.max(0, Math.floor(level) - 1);
  return 100 * n + 25 * n * (n - 1);
}

export type LevelInfo = {
  level: number;
  xp: number;
  /** XP where this level started and where the next one starts. */
  levelStartXp: number;
  nextLevelXp: number;
  /** 0..1 of the way to the next level. */
  progress: number;
};

export function levelFor(xp: number): LevelInfo {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  return {
    level,
    xp,
    levelStartXp,
    nextLevelXp,
    progress: (xp - levelStartXp) / (nextLevelXp - levelStartXp),
  };
}

// --- badges ------------------------------------------------------------------------------------

export type BadgeGlyph = 'dumbbell' | 'medal' | 'flame' | 'trophy' | 'bowl' | 'scale' | 'sun';
type BadgeMetric = 'workouts' | 'streak' | 'records' | 'diet' | 'checkIns' | 'earlyWorkouts';

export type BadgeDef = {
  id: string;
  metric: BadgeMetric;
  target: number;
  glyph: BadgeGlyph;
  xp: number;
};

/** Hour before which a workout counts for "Early bird". */
export const EARLY_HOUR = 8;

/** The catalogue, in the order of the grid. Names and how-to texts are in i18n (`badges.<id>`). */
export const badgeCatalogue: readonly BadgeDef[] = [
  { id: 'first_workout', metric: 'workouts', target: 1, glyph: 'dumbbell', xp: 25 },
  { id: 'workouts_10', metric: 'workouts', target: 10, glyph: 'medal', xp: 50 },
  { id: 'workouts_25', metric: 'workouts', target: 25, glyph: 'medal', xp: 75 },
  { id: 'workouts_50', metric: 'workouts', target: 50, glyph: 'medal', xp: 100 },
  { id: 'workouts_100', metric: 'workouts', target: 100, glyph: 'medal', xp: 200 },
  { id: 'streak_7', metric: 'streak', target: 7, glyph: 'flame', xp: 50 },
  { id: 'streak_14', metric: 'streak', target: 14, glyph: 'flame', xp: 75 },
  { id: 'streak_30', metric: 'streak', target: 30, glyph: 'flame', xp: 100 },
  { id: 'streak_100', metric: 'streak', target: 100, glyph: 'flame', xp: 250 },
  { id: 'first_record', metric: 'records', target: 1, glyph: 'trophy', xp: 25 },
  { id: 'records_10', metric: 'records', target: 10, glyph: 'trophy', xp: 75 },
  { id: 'records_50', metric: 'records', target: 50, glyph: 'trophy', xp: 150 },
  { id: 'diet_7', metric: 'diet', target: 7, glyph: 'bowl', xp: 50 },
  { id: 'diet_30', metric: 'diet', target: 30, glyph: 'bowl', xp: 100 },
  { id: 'checkins_10', metric: 'checkIns', target: 10, glyph: 'scale', xp: 50 },
  { id: 'early_bird', metric: 'earlyWorkouts', target: 5, glyph: 'sun', xp: 50 },
];

export type BadgeState = BadgeDef & {
  /** Progress toward the target (capped at the target once earned). */
  current: number;
  earned: boolean;
  /** The day it was earned (the day the count reached the target). */
  earnedOn: string | null;
  /** 0..1 */
  share: number;
};

/** Days on which each metric's events happened, oldest first (one entry per event). */
function metricEvents(input: GamificationInput): Record<BadgeMetric, string[]> {
  const { today } = input;
  const upTo = (days: Iterable<string>) => [...days].filter((d) => d <= today).sort();
  return {
    workouts: upTo(input.workouts.map((w) => w.day)),
    streak: streakMilestones(input.loggedDays, today),
    records: upTo(recordDays(personalRecords(input.exerciseDays, today)).map((r) => r.day)),
    diet: upTo(input.dietOnTargetDays),
    checkIns: upTo(input.checkInDays),
    earlyWorkouts: upTo(input.workouts.filter((w) => w.hour < EARLY_HOUR).map((w) => w.day)),
  };
}

export function badgeStates(input: GamificationInput): BadgeState[] {
  const events = metricEvents(input);
  // A streak badge not earned yet shows the CURRENT streak (a broken one starts again).
  const streakNow = loggingStreak(input.loggedDays, input.today);
  return badgeCatalogue.map((b) => {
    const list = events[b.metric];
    const earned = list.length >= b.target;
    const current = earned
      ? b.target
      : Math.min(b.target, b.metric === 'streak' ? streakNow : list.length);
    return {
      ...b,
      current,
      earned,
      earnedOn: earned ? list[b.target - 1]! : null,
      share: current / b.target,
    };
  });
}

/** The unearned badge closest to done (largest share, then smallest target), and the next two. */
export function nextBadges(badges: readonly BadgeState[], n = 3): BadgeState[] {
  return badges
    .filter((b) => !b.earned)
    .sort((a, b) => b.share - a.share || a.target - b.target)
    .slice(0, n);
}

// --- everything together -----------------------------------------------------------------------

export type Gamification = {
  streak: number;
  bestStreak: number;
  level: LevelInfo;
  badges: BadgeState[];
  records: PersonalRecord[];
  /** XP earned today (activities + badges earned today). */
  xpToday: number;
};

export function computeGamification(input: GamificationInput): Gamification {
  const perDay = dailyXp(input);
  const badges = badgeStates(input);
  const activityXp = [...perDay.values()].reduce((a, n) => a + n, 0);
  const badgeXp = badges.filter((b) => b.earned).reduce((a, b) => a + b.xp, 0);
  const xpToday =
    (perDay.get(input.today) ?? 0) +
    badges.filter((b) => b.earnedOn === input.today).reduce((a, b) => a + b.xp, 0);
  return {
    streak: loggingStreak(input.loggedDays, input.today),
    bestStreak: bestStreak(input.loggedDays, input.today),
    level: levelFor(activityXp + badgeXp),
    badges,
    records: personalRecords(input.exerciseDays, input.today),
    xpToday,
  };
}

/** The streak badge after the current streak (for "2 more days for the 2-week badge"). */
export function nextStreakTarget(streak: number): number | null {
  const targets = badgeCatalogue.filter((b) => b.metric === 'streak').map((b) => b.target);
  return targets.find((t) => t > streak) ?? null;
}

/** Days of a period that have passed, today included (for "x of y days" and planned workouts). */
export function elapsedDays(from: string, today: string): number {
  return Math.max(0, daysBetween(from, today) + 1);
}

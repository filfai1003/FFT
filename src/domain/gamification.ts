import { addDays, daysBetween, weekOf } from './day';
import { dietDayStatus, ON_TARGET_TOLERANCE, type Macros } from './diet';
import { loggingStreak } from './streak';
import {
  balanceMuscles,
  guideOf,
  guideStatus,
  muscleVolume,
  type ExerciseMuscles,
  type MuscleVolume,
  type VolumeSet,
} from './volume';

/**
 * Personal gamification (DECISIONS 89, 126): streaks, XP and levels, personal records and badges,
 * all DERIVED from what the user logged. Nothing here is stored: the same data always gives the
 * same level, records and badges, on every device. Pure functions, no clock: callers pass `today`.
 * The one input that does not come from the log is the plan (Supporter / Premium badges): the
 * caller passes it (`plan`, from `lib/plan`).
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

/** A day with food logged: what was eaten and that day's target (null = no target, DECISIONS 104). */
export type DietDay = { day: string; eaten: Macros; target: Macros | null };

export type BadgePlan = 'free' | 'supporter' | 'premium';

export type GamificationInput = {
  today: string;
  /** The user's week start: weekly rules (cheat days, rest days, balanced weeks) follow it. */
  weekStart?: 'mon' | 'sun';
  /** The account's plan (Supporter / Premium badges); null or absent = free / unknown. */
  plan?: BadgePlan | null;
  /** Days with anything logged: food, a finished workout or a body entry (the streak's days). */
  loggedDays: ReadonlySet<string>;
  workouts: readonly WorkoutDay[];
  /** Days whose calories were within 10 % of the target (`dietDayStatus` = 'onTarget'). */
  dietOnTargetDays: ReadonlySet<string>;
  /** Days with a body entry (weight, body fat or a measurement). */
  checkInDays: ReadonlySet<string>;
  exerciseDays: readonly ExerciseDay[];
  /** Days with food logged or a fixed meal done / adjusted ("Diet days logged" badges). */
  dietLoggedDays?: ReadonlySet<string>;
  /** Eaten totals and the target of each day with food (the "diet respected" rule). */
  dietDays?: readonly DietDay[];
  /** One entry (its day) per supplement tick. */
  supplementTicks?: readonly string[];
  /** Days on which every supplement the user had then was ticked (at least one was due). */
  supplementDays?: ReadonlySet<string>;
  /** Days on which the user had at least one supplement (ticked or not). */
  supplementDueDays?: ReadonlySet<string>;
  /** Days on which the water goal was reached. */
  waterGoalDays?: ReadonlySet<string>;
  /** First day of use: the account's creation or the first logged row, whichever is earlier. */
  firstDay?: string | null;
  /** Completed sets of finished workouts and each exercise's muscles (balanced weeks). */
  volumeSets?: readonly VolumeSet[];
  exerciseMuscles?: ReadonlyMap<string, ExerciseMuscles>;
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

/**
 * The day each run length was first reached (index n-1 = first day with a run of n), over days
 * `step` apart (1 = days in a row; 7 = weeks in a row, given each week's first day).
 */
export function runMilestones(days: ReadonlySet<string>, today: string, step = 1): string[] {
  const sorted = [...days].filter((d) => d <= today).sort();
  const firstReached: string[] = [];
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev != null && addDays(prev, step) === d ? run + 1 : 1;
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

/** Record days: one per exercise and day, whatever kinds were beaten (what XP counts). */
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

// --- day rules (DECISIONS 126) -----------------------------------------------------------------

/** Off-target days a week may have and still keep the diet run ("cheat days"). */
export const CHEAT_DAYS_PER_WEEK = 2;
/** Rest days a week may have and still keep the workout run (never two in a row). */
export const REST_DAYS_PER_WEEK = 2;

const within = (eaten: number, target: number) =>
  target > 0 && Math.abs(eaten - target) / target <= ON_TARGET_TOLERANCE;

/**
 * A week's totals are on target: calories, and each macro that has a target, summed over the
 * week's days with food and a target, within 10 % of the summed targets.
 */
export function weekTotalsOnTarget(days: readonly DietDay[]): boolean {
  const judged = days.filter((d) => d.target != null && d.eaten.kcal > 0);
  if (judged.length === 0) return false;
  const keys = ['kcal', 'protein', 'carbs', 'fat'] as const;
  for (const k of keys) {
    const target = judged.reduce((a, d) => a + (d.target![k] > 0 ? d.target![k] : 0), 0);
    if (k !== 'kcal' && target <= 0) continue; // no target for this macro
    const eaten = judged.reduce((a, d) => a + (d.target![k] > 0 ? d.eaten[k] : 0), 0);
    if (!within(eaten, target)) return false;
  }
  return true;
}

/**
 * Days on which the diet was respected (the "diet in a row" badges and the medals):
 * - a day with food and a target whose calories are within 10 % of it always counts;
 * - a day without a target, or without any food, never counts (it breaks the run);
 * - an off-target day counts as a cheat day: at most the first 2 of each week (the user's week
 *   start), and only when the WEEK's totals of calories and of each macro with a target are
 *   within 10 % of the week's summed targets (`weekTotalsOnTarget`);
 * - the week in progress is judged on its days so far: its cheat days count for now and its
 *   totals are checked once the week is over (the run can lose them then);
 * - today counts once on target; otherwise it is still open (neither counts nor breaks).
 */
export function dietRespectedDays(
  days: readonly DietDay[],
  today: string,
  weekStart: 'mon' | 'sun',
): Set<string> {
  const byDay = new Map(days.filter((d) => d.day <= today).map((d) => [d.day, d]));
  const out = new Set<string>();
  if (byDay.size === 0) return out;
  const first = [...byDay.keys()].sort()[0]!;
  for (let start = weekOf(first, weekStart)[0]!; start <= today; start = addDays(start, 7)) {
    const week = weekOf(start, weekStart);
    const complete = week[6]! < today;
    const off: string[] = [];
    for (const d of week) {
      if (d > today) break;
      const e = byDay.get(d);
      const status = e?.target ? dietDayStatus(e.eaten.kcal, e.target.kcal) : 'none';
      if (status === 'onTarget') out.add(d);
      else if (status === 'off' && d !== today) off.push(d);
    }
    const weekDays = week.map((d) => byDay.get(d)).filter((d): d is DietDay => d != null);
    if (!complete || weekTotalsOnTarget(weekDays))
      for (const d of off.slice(0, CHEAT_DAYS_PER_WEEK)) out.add(d);
  }
  return out;
}

/**
 * Days on which the workout plan was respected (the "workouts in a row" badges and the medals):
 * - a day with a finished workout always counts;
 * - a rest day counts when the day before had a workout (never two rest days in a row, also
 *   across the end of a week) and it is one of the first 2 such rest days of its week (the
 *   user's week start). Any other day without a workout breaks the run.
 * So a week the run covers whole has at least 5 workout days; a run that starts mid-week is
 *   judged on its own days. The week in progress is judged so far, and today without a workout
 *   is still open (neither counts nor breaks).
 */
export function workoutRespectedDays(
  trained: ReadonlySet<string>,
  today: string,
  weekStart: 'mon' | 'sun',
): Set<string> {
  const out = new Set<string>();
  const days = [...trained].filter((d) => d <= today).sort();
  if (days.length === 0) return out;
  let week = '';
  let rests = 0;
  for (let d = days[0]!; d <= today; d = addDays(d, 1)) {
    const w = weekOf(d, weekStart)[0]!;
    if (w !== week) {
      week = w;
      rests = 0;
    }
    if (trained.has(d)) out.add(d);
    else if (d === today) break;
    else if (trained.has(addDays(d, -1)) && rests < REST_DAYS_PER_WEEK) {
      out.add(d);
      rests += 1;
    }
  }
  return out;
}

/**
 * A balanced week (DECISIONS 126): every muscle that has a weekly-sets guideline in the training
 * balance (`volume.ts`) sits within it. The seam with `volume.ts` is kept to this function and
 * `balancedWeeks`, so a change of muscles or guidelines there only needs these two adapted.
 */
export function isBalancedWeek(perMuscle: Partial<Record<string, MuscleVolume>>): boolean {
  // Helper muscles without a guideline (DECISIONS 125) are not asked for.
  const guided = balanceMuscles.map((m) => m.muscle).filter((m) => guideOf(m) != null);
  return (
    guided.length > 0 &&
    guided.every((m) => guideStatus(perMuscle[m]?.sets ?? 0, guideOf(m)) === 'within')
  );
}

/**
 * First days of the COMPLETED weeks that were balanced, oldest first. A week without workouts is
 * never balanced; the week in progress never counts yet.
 */
export function balancedWeeks(
  sets: readonly VolumeSet[],
  musclesOf: (exerciseId: string) => ExerciseMuscles | undefined,
  today: string,
  weekStart: 'mon' | 'sun',
): string[] {
  const current = weekOf(today, weekStart)[0]!;
  const byWeek = new Map<string, VolumeSet[]>();
  for (const s of sets) {
    const w = weekOf(s.day, weekStart)[0]!;
    if (w >= current) continue;
    byWeek.set(w, [...(byWeek.get(w) ?? []), s]);
  }
  return [...byWeek.keys()]
    .sort()
    .filter((w) => isBalancedWeek(muscleVolume(byWeek.get(w)!, musclesOf, w, addDays(w, 6))));
}

// --- badges ------------------------------------------------------------------------------------

export type BadgeGlyph =
  | 'dumbbell'
  | 'medal'
  | 'flame'
  | 'trophy'
  | 'bowl'
  | 'pill'
  | 'droplet'
  | 'star'
  | 'sparkle'
  | 'calendar'
  | 'sliders';

export type BadgeMetric =
  | 'plan'
  | 'workouts'
  | 'dietDays'
  | 'supplementTicks'
  | 'waterDays'
  | 'memberDays'
  | 'balancedWeeks'
  /** Runs (days in a row, or weeks in a row for balancedRun). */
  | 'dietRun'
  | 'workoutRun'
  | 'waterRun'
  | 'supplementRun'
  | 'medalRun'
  | 'balancedRun'
  | 'all';

/** The grid's sections, in order. */
export const badgeFamilies = [
  'plans',
  'workouts',
  'diet',
  'supplements',
  'water',
  'membership',
  'streaks',
  'balance',
  'medals',
  'all',
] as const;
export type BadgeFamily = (typeof badgeFamilies)[number];

/** How hard a badge is: common ones come with normal use, rare and epic ones ask for discipline. */
export type BadgeRarity = 'common' | 'rare' | 'epic';

export const medalTiers = [
  'bronze',
  'iron',
  'gold',
  'platinum',
  'emerald',
  'diamond',
  'master',
  'champion',
] as const;
export type MedalTier = (typeof medalTiers)[number];

export type BadgeDef = {
  id: string;
  family: BadgeFamily;
  metric: BadgeMetric;
  target: number;
  glyph: BadgeGlyph;
  xp: number;
  rarity: BadgeRarity;
  /** Medals: the tier (its own colours, `colors.medal`). */
  medal?: MedalTier;
};

const LIFETIME = [1, 10, 25, 50, 100, 250, 500, 1000] as const;
/** XP of a lifetime count badge (workouts, diet days, supplements, water days) by target. */
const COUNT_XP: Record<number, number> = {
  1: 10,
  10: 25,
  25: 50,
  50: 100,
  100: 150,
  250: 300,
  500: 500,
  1000: 800,
};
/** XP of a days-in-a-row badge by target: a run is much harder than the same total. */
const RUN_XP: Record<number, number> = {
  1: 10,
  10: 50,
  25: 100,
  50: 200,
  100: 300,
  250: 600,
  500: 1000,
  1000: 1500,
};
const MEMBER_DAYS = [1, 7, 30, 365, 730, 1825] as const;
const MEMBER_XP: Record<number, number> = { 1: 10, 7: 25, 30: 50, 365: 250, 730: 400, 1825: 600 };
const BALANCE_WEEKS = [1, 10, 25, 50, 100, 250] as const;
const BALANCED_WEEKS_XP: Record<number, number> = {
  1: 25,
  10: 100,
  25: 200,
  50: 300,
  100: 500,
  250: 1000,
};
const BALANCED_RUN_XP: Record<number, number> = {
  1: 25,
  10: 200,
  25: 400,
  50: 700,
  100: 1200,
  250: 2500,
};
const MEDAL_DAYS: Record<MedalTier, number> = {
  bronze: 1,
  iron: 10,
  gold: 25,
  platinum: 50,
  emerald: 100,
  diamond: 250,
  master: 500,
  champion: 1000,
};
const MEDAL_XP: Record<MedalTier, number> = {
  bronze: 25,
  iron: 100,
  gold: 200,
  platinum: 400,
  emerald: 600,
  diamond: 1200,
  master: 2000,
  champion: 3000,
};
const MEDAL_RARITY: Record<MedalTier, BadgeRarity> = {
  bronze: 'common',
  iron: 'common',
  gold: 'common',
  platinum: 'rare',
  emerald: 'rare',
  diamond: 'epic',
  master: 'epic',
  champion: 'epic',
};

/** Owner's rule: common up to 25, rare 50–100, epic from 250. */
const rarityOf = (target: number): BadgeRarity =>
  target >= 250 ? 'epic' : target >= 50 ? 'rare' : 'common';
/** Balanced weeks: 1–10 common, 25–50 rare, 100–250 epic. */
const weeksRarity = (target: number): BadgeRarity =>
  target >= 100 ? 'epic' : target >= 25 ? 'rare' : 'common';

const ladder = (
  family: BadgeFamily,
  metric: BadgeMetric,
  glyph: BadgeGlyph,
  id: (n: number) => string,
  targets: readonly number[],
  xp: Record<number, number>,
  rarity: (n: number) => BadgeRarity = rarityOf,
): BadgeDef[] =>
  targets.map((target) => ({
    id: id(target),
    family,
    metric,
    target,
    glyph,
    xp: xp[target]!,
    rarity: rarity(target),
  }));

const withoutAll: BadgeDef[] = [
  // Plans: no XP (paying is not an achievement, and levels show on the leaderboards).
  {
    id: 'supporter',
    family: 'plans',
    metric: 'plan',
    target: 1,
    glyph: 'star',
    xp: 0,
    rarity: 'rare',
  },
  {
    id: 'premium',
    family: 'plans',
    metric: 'plan',
    target: 2,
    glyph: 'sparkle',
    xp: 0,
    rarity: 'rare',
  },
  // `first_workout` and `workouts_10…250` keep the ids of the first catalogue (same meaning).
  ...ladder(
    'workouts',
    'workouts',
    'dumbbell',
    (n) => (n === 1 ? 'first_workout' : `workouts_${n}`),
    LIFETIME,
    COUNT_XP,
  ),
  ...ladder('diet', 'dietDays', 'bowl', (n) => `diet_days_${n}`, LIFETIME, COUNT_XP),
  ...ladder(
    'supplements',
    'supplementTicks',
    'pill',
    (n) => `supplements_${n}`,
    LIFETIME,
    COUNT_XP,
  ),
  ...ladder('water', 'waterDays', 'droplet', (n) => `water_${n}`, LIFETIME, COUNT_XP),
  ...ladder('membership', 'memberDays', 'calendar', (n) => `member_${n}`, MEMBER_DAYS, MEMBER_XP),
  ...ladder('streaks', 'dietRun', 'bowl', (n) => `diet_run_${n}`, LIFETIME, RUN_XP),
  ...ladder('streaks', 'workoutRun', 'dumbbell', (n) => `train_run_${n}`, LIFETIME, RUN_XP),
  ...ladder('streaks', 'waterRun', 'droplet', (n) => `water_run_${n}`, LIFETIME, RUN_XP),
  ...ladder('streaks', 'supplementRun', 'pill', (n) => `supplement_run_${n}`, LIFETIME, RUN_XP),
  ...ladder(
    'balance',
    'balancedWeeks',
    'sliders',
    (n) => `balanced_weeks_${n}`,
    BALANCE_WEEKS,
    BALANCED_WEEKS_XP,
    weeksRarity,
  ),
  ...ladder(
    'balance',
    'balancedRun',
    'sliders',
    (n) => `balanced_run_${n}`,
    BALANCE_WEEKS,
    BALANCED_RUN_XP,
    weeksRarity,
  ),
  ...medalTiers.map((tier): BadgeDef => ({
    id: `medal_${tier}`,
    family: 'medals',
    metric: 'medalRun',
    target: MEDAL_DAYS[tier],
    glyph: 'medal',
    xp: MEDAL_XP[tier],
    rarity: MEDAL_RARITY[tier],
    medal: tier,
  })),
];

/**
 * "All challenges completed" asks for every other badge EXCEPT Supporter and Premium: those are
 * bought, not earned, and a free user must be able to complete everything.
 */
const challengeIds = withoutAll.filter((b) => b.family !== 'plans').map((b) => b.id);

/** The catalogue, in the order of the grid. Names and how-to texts are in i18n (`badges.<id>`). */
export const badgeCatalogue: readonly BadgeDef[] = [
  ...withoutAll,
  {
    id: 'all_challenges',
    family: 'all',
    metric: 'all',
    target: challengeIds.length,
    glyph: 'trophy',
    xp: 3000,
    rarity: 'epic',
  },
];

/** Badge ids the community may show: every badge but the plan ones (DECISIONS 120, 126). */
export const isCommunityBadge = (id: string) => id !== 'supporter' && id !== 'premium';

export type BadgeState = BadgeDef & {
  /** Progress toward the target (capped at the target once earned). */
  current: number;
  earned: boolean;
  /** The day it was earned (the day the count reached the target); null for plan badges. */
  earnedOn: string | null;
  /** 0..1 */
  share: number;
};

/** Days on which every medal condition held: diet, workouts, water and supplements. */
export function medalDays(input: GamificationInput): Set<string> {
  const weekStart = input.weekStart ?? 'mon';
  const diet = dietRespectedDays(input.dietDays ?? [], input.today, weekStart);
  const trained = workoutRespectedDays(
    new Set(input.workouts.map((w) => w.day)),
    input.today,
    weekStart,
  );
  const water = input.waterGoalDays ?? new Set<string>();
  const supps = input.supplementDays ?? new Set<string>();
  const due = input.supplementDueDays ?? new Set<string>();
  const out = new Set<string>();
  for (const d of diet) {
    if (!trained.has(d) || !water.has(d)) continue;
    // A day without any supplement to take counts as met.
    if (due.has(d) && !supps.has(d)) continue;
    out.add(d);
  }
  return out;
}

type MetricProgress = {
  /** The day each count was reached, oldest first (index n-1 = the day n was reached). */
  events: string[];
  /** What an unearned badge shows: the count, or the CURRENT run for runs. */
  current: number;
};

function metricProgress(
  input: GamificationInput,
): Record<Exclude<BadgeMetric, 'plan' | 'all'>, MetricProgress> {
  const { today } = input;
  const weekStart = input.weekStart ?? 'mon';
  const upTo = (days: Iterable<string>) => [...days].filter((d) => d <= today).sort();
  const count = (days: Iterable<string>): MetricProgress => {
    const events = upTo(days);
    return { events, current: events.length };
  };
  const run = (days: ReadonlySet<string>): MetricProgress => ({
    events: runMilestones(days, today),
    current: loggingStreak(days, today),
  });

  const trained = new Set(input.workouts.map((w) => w.day));
  const members = (() => {
    if (!input.firstDay || input.firstDay > today) return { events: [], current: 0 };
    const since = daysBetween(input.firstDay, today);
    const n = Math.min(since, MEMBER_DAYS[MEMBER_DAYS.length - 1]);
    return {
      events: Array.from({ length: n }, (_, i) => addDays(input.firstDay!, i + 1)),
      current: since,
    };
  })();
  const muscles = input.exerciseMuscles;
  const weeks = new Set(
    balancedWeeks(input.volumeSets ?? [], (id) => muscles?.get(id), today, weekStart),
  );
  // The weeks run ends with the last COMPLETED week (the one in progress does not break it).
  const lastWeek = addDays(weekOf(today, weekStart)[0]!, -7);
  let weekRun = 0;
  for (let w = lastWeek; weeks.has(w); w = addDays(w, -7)) weekRun += 1;

  return {
    workouts: count(input.workouts.map((w) => w.day)),
    dietDays: count(input.dietLoggedDays ?? []),
    supplementTicks: count(input.supplementTicks ?? []),
    waterDays: count(input.waterGoalDays ?? []),
    memberDays: members,
    balancedWeeks: count(weeks),
    dietRun: run(dietRespectedDays(input.dietDays ?? [], today, weekStart)),
    workoutRun: run(workoutRespectedDays(trained, today, weekStart)),
    waterRun: run(input.waterGoalDays ?? new Set()),
    supplementRun: run(input.supplementDays ?? new Set()),
    medalRun: run(medalDays(input)),
    balancedRun: { events: runMilestones(weeks, today, 7), current: weekRun },
  };
}

const PLAN_RANK: Record<BadgePlan, number> = { free: 0, supporter: 1, premium: 2 };

export function badgeStates(input: GamificationInput): BadgeState[] {
  const progress = metricProgress(input);
  const plan = PLAN_RANK[input.plan ?? 'free'] ?? 0;
  const states = withoutAll.map((b): BadgeState => {
    if (b.metric === 'plan') {
      // Supporter: while the plan is Supporter or Premium; Premium: while it is Premium.
      const earned = plan >= b.target;
      return {
        ...b,
        current: earned ? 1 : 0,
        target: 1,
        earned,
        earnedOn: null,
        share: earned ? 1 : 0,
      };
    }
    const p = progress[b.metric as keyof typeof progress];
    const earned = p.events.length >= b.target;
    const current = earned ? b.target : Math.min(b.target, p.current);
    return {
      ...b,
      current,
      earned,
      earnedOn: earned ? p.events[b.target - 1]! : null,
      share: current / b.target,
    };
  });
  const challenges = states.filter((s) => s.family !== 'plans');
  const done = challenges.filter((s) => s.earned);
  const all = badgeCatalogue[badgeCatalogue.length - 1]!;
  const allEarned = done.length === challenges.length;
  return [
    ...states,
    {
      ...all,
      current: done.length,
      earned: allEarned,
      earnedOn: allEarned
        ? done.map((s) => s.earnedOn ?? '').sort()[done.length - 1] || null
        : null,
      share: done.length / all.target,
    },
  ];
}

/**
 * The unearned badge closest to done (largest share, then smallest target), and the next two.
 * Plan badges are never suggested (they are bought, not earned).
 */
export function nextBadges(badges: readonly BadgeState[], n = 3): BadgeState[] {
  return badges
    .filter((b) => !b.earned && b.family !== 'plans')
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

/**
 * Logging streak goals shown with the streak ring ("2 more days to a 14-day streak"). Plain
 * goals since DECISIONS 126: the logging streak has no badges of its own any more.
 */
export const STREAK_GOALS = [7, 14, 30, 100, 365] as const;

/** The streak goal after the current streak, or null past the last one. */
export function nextStreakTarget(streak: number): number | null {
  return STREAK_GOALS.find((t) => t > streak) ?? null;
}

/** Days of a period that have passed, today included (for "x of y days" and planned workouts). */
export function elapsedDays(from: string, today: string): number {
  return Math.max(0, daysBetween(from, today) + 1);
}

/**
 * Muscles and how much an exercise works each of them (DECISIONS 125).
 *
 * An exercise has one **primary** muscle (1 set per set done), any **secondary** muscles (half a
 * set each: they help) and any **indirect** muscles (a quarter set each: they steady or assist a
 * little). Same rules in SQL: the check constraints of `public.exercises`, the trigger
 * `public.normalize_exercise_muscles()` and `public.strength_group()`.
 */

/** The 17 muscles, in display order (grouped by their strength group). */
export const muscles = [
  'chest',
  'lats',
  'upper_back',
  'lower_back',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'calves',
  'abs',
  'obliques',
] as const;
export type Muscle = (typeof muscles)[number];

/** The eight coarse muscles used before DECISIONS 125 (old rows, old exports, old app versions). */
export const legacyMuscles = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'glutes',
  'abs',
] as const;
export type LegacyMuscle = (typeof legacyMuscles)[number];

/** Groups of the strength score and of the exercise filters: Chest, Back, Shoulders, Arms, Legs, Core. */
export const strengthGroups = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'] as const;
export type StrengthGroup = (typeof strengthGroups)[number];

const GROUP_OF: Record<Muscle | LegacyMuscle, StrengthGroup> = {
  chest: 'chest',
  lats: 'back',
  upper_back: 'back',
  lower_back: 'back',
  back: 'back',
  front_delts: 'shoulders',
  side_delts: 'shoulders',
  rear_delts: 'shoulders',
  shoulders: 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  quads: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  adductors: 'legs',
  calves: 'legs',
  legs: 'legs',
  abs: 'core',
  obliques: 'core',
};

/**
 * The strength group of a muscle (an exercise's group comes from its primary muscle). Same
 * mapping as the SQL function public.strength_group(); old muscle names are still understood.
 */
export function strengthGroup(muscle: Muscle | LegacyMuscle): StrengthGroup {
  return GROUP_OF[muscle];
}

/** The muscles of each group, in display order. */
export const musclesByGroup: Record<StrengthGroup, Muscle[]> = Object.fromEntries(
  strengthGroups.map((g) => [g, muscles.filter((m) => GROUP_OF[m] === g)]),
) as Record<StrengthGroup, Muscle[]>;

export const isMuscle = (m: unknown): m is Muscle =>
  typeof m === 'string' && (muscles as readonly string[]).includes(m);

/** How much an exercise works a muscle. */
export type Involvement = 'primary' | 'secondary' | 'indirect';
export const involvements: Involvement[] = ['primary', 'secondary', 'indirect'];

/** Share of a set each level gets: primary 1, secondary 0.5, indirect 0.25. */
export const INVOLVEMENT_SHARE: Record<Involvement, number> = {
  primary: 1,
  secondary: 0.5,
  indirect: 0.25,
};

/** The muscles an exercise works, by level. */
export type ExerciseMuscles = {
  primary: Muscle;
  secondary: readonly Muscle[];
  indirect: readonly Muscle[];
};

/** Share of a set each muscle of an exercise gets (a muscle counts once, at its highest level). */
export function muscleShares(m: ExerciseMuscles): Map<Muscle, number> {
  const shares = new Map<Muscle, number>([[m.primary, INVOLVEMENT_SHARE.primary]]);
  for (const s of m.secondary) if (!shares.has(s)) shares.set(s, INVOLVEMENT_SHARE.secondary);
  for (const s of m.indirect) if (!shares.has(s)) shares.set(s, INVOLVEMENT_SHARE.indirect);
  return shares;
}

/** The muscles of an exercise as a map { muscle: share } (the API's `muscles` field). */
export function muscleLoad(m: ExerciseMuscles): Record<string, number> {
  return Object.fromEntries(muscleShares(m));
}

const uniq = <T>(list: readonly T[]) => [...new Set(list)];

/**
 * The muscles of a stored row in today's vocabulary (DECISIONS 125). Old names are mapped the way
 * the migration maps the user's own exercises:
 * - primary `back` → `lats`, with `upper_back` as a secondary muscle; `shoulders` → `front_delts`;
 *   `legs` → `quads`;
 * - secondary `back` → `upper_back` (secondary) and `lats` (indirect); `shoulders` →
 *   `front_delts`; `legs` → `quads`; the same for indirect ones (both back muscles indirect).
 * Then each muscle keeps only its highest level and unknown names are dropped. Same as the SQL
 * trigger `normalize_exercise_muscles`. Returns null when the primary muscle is unknown.
 */
export function normalizeMuscles(raw: {
  primary: string | null | undefined;
  secondary?: readonly string[] | null;
  indirect?: readonly string[] | null;
}): ExerciseMuscles | null {
  const secondary: string[] = [];
  const indirect: string[] = [];
  let primary = raw.primary ?? '';
  if (primary === 'back') {
    primary = 'lats';
    secondary.push('upper_back');
  } else if (primary === 'shoulders') primary = 'front_delts';
  else if (primary === 'legs') primary = 'quads';
  if (!isMuscle(primary)) return null;

  for (const m of raw.secondary ?? []) {
    if (m === 'back') {
      secondary.push('upper_back');
      indirect.push('lats');
    } else if (m === 'shoulders') secondary.push('front_delts');
    else if (m === 'legs') secondary.push('quads');
    else secondary.push(m);
  }
  for (const m of raw.indirect ?? []) {
    if (m === 'back') indirect.push('upper_back', 'lats');
    else if (m === 'shoulders') indirect.push('front_delts');
    else if (m === 'legs') indirect.push('quads');
    else indirect.push(m);
  }
  const sec = uniq(secondary).filter((m): m is Muscle => isMuscle(m) && m !== primary);
  const ind = uniq(indirect).filter(
    (m): m is Muscle => isMuscle(m) && m !== primary && !sec.includes(m),
  );
  return { primary, secondary: sec, indirect: ind };
}

/** What the `muscle` argument of the list_exercises tool accepts (app coach, API and MCP). */
export const MUSCLE_FILTER_HELP = `A muscle (${muscles.join(', ')}) or a group (${strengthGroups.join(', ')}); optional.`;

export type ExerciseListRow = {
  name: string;
  primary_muscle: string;
  secondary_muscles?: readonly string[] | null;
  indirect_muscles?: readonly string[] | null;
  equipment: string;
};

/**
 * The list_exercises answer (app coach, API, MCP): `muscle` (the primary one) and `equipment` as
 * before, plus the exercise's `group` and `muscles` ({ muscle: share of a set }, DECISIONS 125).
 * `filter` is a muscle or a group (an old muscle name works as its group).
 */
export function listExercises(rows: readonly ExerciseListRow[], filter?: string | null) {
  const f = filter?.trim().toLowerCase() || null;
  return rows.flatMap((r) => {
    const m = normalizeMuscles({
      primary: r.primary_muscle,
      secondary: r.secondary_muscles,
      indirect: r.indirect_muscles,
    });
    if (!m) return [];
    const group = strengthGroup(m.primary);
    if (f && f !== m.primary && f !== group) return [];
    return [
      { name: r.name, muscle: m.primary, group, muscles: muscleLoad(m), equipment: r.equipment },
    ];
  });
}

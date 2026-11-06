import { isMuscle, muscles, type Muscle } from './muscles';

/**
 * Own exercises and workouts done in the past, entered by an AI (DECISIONS 132). The rules are the
 * same for the in-app coach (device database) and the API / MCP (server database): this file holds
 * the tools' descriptions, the checks of what is sent and the rows to save. A bad value throws an
 * Error with a sentence for the model. Pure: no app or server imports (the server loads this file
 * as it is).
 */

export const EQUIPMENT = ['barbell', 'dumbbells', 'machine', 'cables', 'bodyweight', 'bands'];
export const LOG_TYPES = ['weight_reps', 'reps', 'time', 'distance_time'];
const MAX_EXERCISES = 40;
const MAX_SETS = 60;
/** Same limit as a plan's drop sets (DECISIONS 54). */
const MAX_DROPS = 4;

const muscleItems = { type: 'string', enum: [...muscles] };

export const WORKOUT_TOOL_SPECS = {
  create_exercise: {
    description:
      'Save a new exercise of the user, for one list_exercises does not have. If the name exists it is not created again: the answer gives the existing one (created: false).',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'e.g. "Landmine press"' },
        primary_muscle: { ...muscleItems, description: 'The main muscle' },
        secondary_muscles: {
          type: 'array',
          items: muscleItems,
          description: 'Muscles that help (half a set each)',
        },
        indirect_muscles: {
          type: 'array',
          items: muscleItems,
          description: 'Muscles that steady (a quarter of a set each)',
        },
        equipment: { type: 'string', enum: EQUIPMENT },
        log_type: {
          type: 'string',
          enum: LOG_TYPES,
          description: 'What a set records; weight_reps by default',
        },
      },
      required: ['name', 'primary_muscle', 'equipment'],
    },
  },
  log_workout: {
    description:
      'Records a finished workout from a past day or today, with its weights and reps, drop sets included. It counts like one done in the app (history, records, strength, badges), but not for the plan rotation. Exercise names must be exact (list_exercises); create_exercise first for a missing one. All or nothing: on an error nothing is saved.',
    schema: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'The day of the workout, YYYY-MM-DD' },
        name: { type: 'string', description: 'e.g. "Push A"; "Workout" by default' },
        start_time: { type: 'string', description: 'Local time like 18:30; 12:00 by default' },
        duration_minutes: { type: 'number', description: 'How long it took, if known' },
        feeling: { type: 'number', description: 'From 1 to 5' },
        notes: { type: 'string' },
        exercises: {
          type: 'array',
          description: 'In the order they were done',
          items: {
            type: 'object',
            properties: {
              exercise: { type: 'string', description: 'Exact name' },
              exercise_id: { type: 'string', description: 'Instead of the name' },
              sets: {
                type: 'array',
                description:
                  "Each set. By the exercise's log type: weight_reps weight_kg + reps; reps reps; time duration_s; distance_time distance_m + duration_s",
                items: {
                  type: 'object',
                  properties: {
                    weight_kg: { type: 'number' },
                    reps: { type: 'number' },
                    duration_s: { type: 'number' },
                    distance_m: { type: 'number' },
                    drops: {
                      type: 'array',
                      description:
                        'Drop set: the lighter rounds right after this set, in order (weight_reps exercises, 1 to 4)',
                      items: {
                        type: 'object',
                        properties: {
                          weight_kg: { type: 'number' },
                          reps: { type: 'number' },
                        },
                        required: ['weight_kg', 'reps'],
                      },
                    },
                  },
                },
              },
            },
            required: ['sets'],
          },
        },
        allow_second_on_day: {
          type: 'boolean',
          description:
            'Only if the user really did a second workout with this name on this day: without it that is refused, so a repeated call adds nothing twice.',
        },
      },
      required: ['day', 'exercises'],
    },
  },
  delete_workout: {
    description: 'Removes a finished workout from the history (id from the list of workouts).',
    schema: {
      type: 'object',
      properties: { workout_id: { type: 'string' } },
      required: ['workout_id'],
    },
  },
} as const;

type Input = Record<string, unknown>;

function number(v: unknown, name: string, min: number, max: number): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max)
    throw new Error(`${name} must be a number from ${min} to ${max}`);
  return n;
}
function needed(v: unknown, name: string, min: number, max: number): number {
  const n = number(v, name, min, max);
  if (n == null) throw new Error(`${name} is required`);
  return n;
}
function text(v: unknown, name: string, max: number): string | null {
  if (v == null || String(v).trim() === '') return null;
  const s = String(v).trim();
  if (s.length > max) throw new Error(`${name} is too long (at most ${max} characters)`);
  return s;
}

function muscleList(v: unknown, name: string, taken: readonly string[]): Muscle[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new Error(`${name} must be a list of muscles`);
  for (const m of v) if (!isMuscle(m)) throw new Error(`${name}: unknown muscle "${m}"`);
  return [...new Set(v as Muscle[])].filter((m) => !taken.includes(m));
}

export type NewExercise = {
  name: string;
  primaryMuscle: Muscle;
  secondaryMuscles: Muscle[];
  indirectMuscles: Muscle[];
  equipment: string;
  logType: string;
};

export function parseNewExercise(input: Input): NewExercise {
  const name = text(input.name, 'name', 80);
  if (!name) throw new Error('name is required');
  const primary = input.primary_muscle;
  if (!isMuscle(primary)) throw new Error(`primary_muscle must be one of: ${muscles.join(', ')}`);
  const equipment = String(input.equipment ?? '');
  if (!EQUIPMENT.includes(equipment))
    throw new Error(`equipment must be one of: ${EQUIPMENT.join(', ')}`);
  const logType = String(input.log_type ?? 'weight_reps');
  if (!LOG_TYPES.includes(logType))
    throw new Error(`log_type must be one of: ${LOG_TYPES.join(', ')}`);
  const secondaryMuscles = muscleList(input.secondary_muscles, 'secondary_muscles', [primary]);
  const indirectMuscles = muscleList(input.indirect_muscles, 'indirect_muscles', [
    primary,
    ...secondaryMuscles,
  ]);
  return { name, primaryMuscle: primary, secondaryMuscles, indirectMuscles, equipment, logType };
}

/** The exercises the user can pick: catalogue and own, not deleted. */
export type KnownExercise = {
  id: string;
  name: string;
  log_type: string;
  owner_id?: string | null;
};

/** By name, whatever the case; the user's own wins over a catalogue exercise of the same name. */
export function findExercise(
  known: readonly KnownExercise[],
  name: string,
): KnownExercise | undefined {
  const wanted = name.trim().toLowerCase();
  const same = known.filter((e) => e.name.trim().toLowerCase() === wanted);
  return same.find((e) => e.owner_id != null) ?? same[0];
}

export type PastSet = {
  weight_kg?: number;
  reps?: number;
  duration_s?: number;
  distance_m?: number;
  drops: { weight_kg: number; reps: number }[];
};

export type PastWorkout = {
  day: string;
  name: string;
  /** Local time, HH:MM. */
  startTime: string;
  /** 0 when unknown: start and end are the same moment, as for "Mark as done". */
  minutes: number;
  feeling: number | null;
  notes: string | null;
  allowSecond: boolean;
  exercises: { id: string; name: string; sets: PastSet[] }[];
};

const weight = (v: unknown, label: string) =>
  Math.round(needed(v, `${label}: weight_kg`, 0, 1000) * 100) / 100;
const repsOf = (v: unknown, label: string) => Math.round(needed(v, `${label}: reps`, 1, 1000));

/** One set: the columns of its exercise's log type, as the app saves them. */
function parseSet(raw: Input, logType: string, label: string): PastSet {
  const given = raw.drops;
  if (given != null && !Array.isArray(given)) throw new Error(`${label}: drops must be a list`);
  const list = (given ?? []) as Input[];
  if (list.length > 0 && logType !== 'weight_reps')
    throw new Error(`${label}: drops are only for exercises with weight and reps`);
  if (list.length > MAX_DROPS) throw new Error(`${label}: at most ${MAX_DROPS} drops`);
  const duration = () => Math.round(needed(raw.duration_s, `${label}: duration_s`, 1, 86400));
  if (logType === 'weight_reps')
    return {
      weight_kg: weight(raw.weight_kg, label),
      reps: repsOf(raw.reps, label),
      drops: list.map((d, k) => ({
        weight_kg: weight(d?.weight_kg, `${label}, drop ${k + 1}`),
        reps: repsOf(d?.reps, `${label}, drop ${k + 1}`),
      })),
    };
  if (logType === 'reps') return { reps: repsOf(raw.reps, label), drops: [] };
  if (logType === 'time') return { duration_s: duration(), drops: [] };
  const distance = needed(raw.distance_m, `${label}: distance_m`, 1, 1e6);
  return { duration_s: duration(), distance_m: Math.round(distance * 10) / 10, drops: [] };
}

/** Checks a whole workout against the exercises the user has, before anything is saved. */
export function parsePastWorkout(
  input: Input,
  today: string,
  known: readonly KnownExercise[],
): PastWorkout {
  const day = input.day == null || input.day === 'today' ? today : String(input.day);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)))
    throw new Error('day must be a date like 2026-10-15');
  if (day > today) throw new Error('day must not be in the future');
  if (day < '2000-01-01') throw new Error('day is too far in the past');
  const startTime = text(input.start_time, 'start_time', 5) ?? '12:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime))
    throw new Error('start_time must be a time like 18:30');
  const given = input.exercises as Input[];
  if (!Array.isArray(given) || given.length === 0) throw new Error('exercises must not be empty');
  if (given.length > MAX_EXERCISES) throw new Error(`at most ${MAX_EXERCISES} exercises`);

  const lookup = (e: Input) =>
    e?.exercise_id
      ? known.find((x) => x.id === e.exercise_id)
      : findExercise(known, String(e?.exercise ?? ''));
  if (given.some((e) => !e?.exercise_id && !String(e?.exercise ?? '').trim()))
    throw new Error('every exercise needs exercise or exercise_id');
  const missing = given.filter((e) => !lookup(e)).map((e) => e.exercise_id ?? e.exercise);
  if (missing.length > 0)
    throw new Error(
      `Not found: ${missing.join(', ')}. Use exact names from list_exercises, or create_exercise first. Nothing was saved.`,
    );

  // The same exercise twice in one list is one exercise of the workout, with all its sets.
  const merged = new Map<string, PastWorkout['exercises'][number]>();
  for (const e of given) {
    const ex = lookup(e)!;
    if (!Array.isArray(e.sets) || e.sets.length === 0)
      throw new Error(`${ex.name}: sets must not be empty`);
    const row = merged.get(ex.id) ?? { id: ex.id, name: ex.name, sets: [] };
    merged.set(ex.id, row);
    for (const raw of e.sets as Input[])
      row.sets.push(parseSet(raw ?? {}, ex.log_type, `${ex.name}, set ${row.sets.length + 1}`));
    if (row.sets.length > MAX_SETS) throw new Error(`${ex.name}: at most ${MAX_SETS} sets`);
  }

  return {
    day,
    name: text(input.name, 'name', 80) ?? 'Workout',
    startTime,
    minutes: number(input.duration_minutes, 'duration_minutes', 1, 1440) ?? 0,
    feeling: number(input.feeling, 'feeling', 1, 5),
    notes: text(input.notes, 'notes', 2000),
    allowSecond: input.allow_second_on_day === true,
    exercises: [...merged.values()],
  };
}

/** Refused unless allow_second_on_day: a repeated call must not double the records. */
export const sameDayMessage = (name: string, day: string, id: string) =>
  `A workout named "${name}" is already on ${day} (id ${id}). Nothing was saved. If it is really a second one, call again with allow_second_on_day.`;

/** The rows of a workout's exercises and sets; each drop is a row next to its set (DECISIONS 54). */
export function pastWorkoutRows(
  w: PastWorkout,
  at: { sessionId: string; userId: string; completedAt: string; newId: () => string },
) {
  const base = { user_id: at.userId, session_id: at.sessionId };
  const exercises = w.exercises.map((e, position) => ({
    ...base,
    id: at.newId(),
    exercise_id: e.id,
    position,
  }));
  const sets = w.exercises.flatMap((e) =>
    e.sets.flatMap((s, set_index) => {
      const row = {
        ...base,
        exercise_id: e.id,
        set_index,
        duration_s: s.duration_s ?? null,
        distance_m: s.distance_m ?? null,
        completed_at: at.completedAt,
      };
      return [
        {
          ...row,
          id: at.newId(),
          drop_index: 0,
          weight_kg: s.weight_kg ?? null,
          reps: s.reps ?? null,
        },
        ...s.drops.map((d, k) => ({
          ...row,
          id: at.newId(),
          drop_index: k + 1,
          weight_kg: d.weight_kg,
          reps: d.reps,
        })),
      ];
    }),
  );
  return { exercises, sets };
}

/** How many sets a workout has (drops are part of their set). */
export const pastWorkoutSets = (w: PastWorkout) =>
  w.exercises.reduce((sum, e) => sum + e.sets.length, 0);

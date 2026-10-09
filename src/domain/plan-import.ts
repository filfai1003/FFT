import { muscles, type Muscle } from './muscles';
import { macroKcal, MIN_DAILY_KCAL } from './nutrition';

/**
 * The exchange format of workout plans and diets between the app and an AI (manual copy & paste
 * or the chat). Plain JSON, snake_case, either part optional:
 *
 *   { "workout_plan": { "name", "days": [ { "name", "exercises": [ { "exercise", "sets", "reps",
 *       "rest_s", "notes" } ] } ] },
 *     "diet_plan": { "daily": { "kcal", "protein_g", "carbs_g", "fat_g" },
 *       "meals": [ { "name", "main", "description", "kcal", "protein_g", "carbs_g", "fat_g" } ],
 *       "workout_after": "<meal name>" } }
 */

export const equipmentList = [
  'barbell',
  'dumbbells',
  'machine',
  'cables',
  'bodyweight',
  'bands',
] as const;
export const logTypes = ['weight_reps', 'reps', 'time', 'distance_time'] as const;
export type ImportLogType = (typeof logTypes)[number];

export type ImportedExercise = {
  name: string;
  sets: number;
  reps: string;
  restS: number;
  notes: string;
  /** Only needed for exercises that are not in the catalogue (they are created). */
  newExercise: { primaryMuscle: Muscle; equipment: string; logType: ImportLogType } | null;
};
export type ImportedDay = { name: string; exercises: ImportedExercise[] };
export type ImportedWorkout = {
  /** Id of an existing plan to update (the chat gives it back); null = a new plan. */
  id: string | null;
  name: string;
  days: ImportedDay[];
};
export type ImportedMeal = {
  name: string;
  isMain: boolean;
  description: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};
export type ImportedDiet = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  meals: ImportedMeal[];
  workoutAfter: string | null;
};
export type ParsedBundle = {
  workout: ImportedWorkout | null;
  diet: ImportedDiet | null;
  /** Blocks the import. */
  errors: string[];
  /** Imported anyway, but worth knowing. */
  warnings: string[];
};

// --- finding the JSON in a reply -----------------------------------------------------------------

/** The JSON object of an AI reply: a ```json block, else the first balanced { … } in the text. */
export function extractJson(text: string): unknown | null {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = fence ? [fence[1], text] : [text];
  for (const c of candidates) {
    const start = c.indexOf('{');
    if (start < 0) continue;
    let depth = 0;
    let inString = false;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        try {
          return JSON.parse(c.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }
  return null;
}

// --- checking it ---------------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) =>
  typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '';
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = num(v);
  return n == null ? fallback : Math.min(max, Math.max(min, Math.round(n)));
};

function parseExercise(raw: unknown, where: string, warnings: string[]): ImportedExercise | null {
  if (!isObject(raw)) return null;
  const name = text(raw.exercise ?? raw.name, 120);
  if (!name) return null;
  const primary = text(raw.primary_muscle, 20).toLowerCase();
  const equipment = text(raw.equipment, 20).toLowerCase();
  const logType = text(raw.log_type, 20).toLowerCase();
  const newExercise =
    (muscles as readonly string[]).includes(primary) &&
    (equipmentList as readonly string[]).includes(equipment)
      ? {
          primaryMuscle: primary as Muscle,
          equipment,
          logType: ((logTypes as readonly string[]).includes(logType)
            ? logType
            : 'weight_reps') as ImportLogType,
        }
      : null;
  if (num(raw.sets) != null && (num(raw.sets)! < 1 || num(raw.sets)! > 20))
    warnings.push(`${where}: "${name}" sets limited to 1–20`);
  return {
    name,
    sets: clampInt(raw.sets, 1, 20, 3),
    reps: text(raw.reps, 20) || '8-12',
    restS: clampInt(raw.rest_s, 0, 1800, 90),
    notes: text(raw.notes, 200),
    newExercise,
  };
}

function parseWorkout(raw: unknown, errors: string[], warnings: string[]): ImportedWorkout | null {
  if (!isObject(raw)) {
    errors.push('workout_plan must be an object');
    return null;
  }
  const days: ImportedDay[] = [];
  const rawDays = Array.isArray(raw.days) ? raw.days : [];
  rawDays.slice(0, 14).forEach((d, i) => {
    if (!isObject(d)) return;
    const name = text(d.name, 60) || `Day ${i + 1}`;
    const exercises = (Array.isArray(d.exercises) ? d.exercises : [])
      .slice(0, 20)
      .map((e) => parseExercise(e, name, warnings))
      .filter((e): e is ImportedExercise => e != null);
    if (exercises.length === 0) warnings.push(`Day "${name}" has no exercises and is skipped`);
    else days.push({ name, exercises });
  });
  if (days.length === 0) {
    errors.push('workout_plan needs at least one day with exercises');
    return null;
  }
  return { id: text(raw.id, 64) || null, name: text(raw.name, 60) || 'AI plan', days };
}

function parseDiet(raw: unknown, errors: string[], warnings: string[]): ImportedDiet | null {
  if (!isObject(raw)) {
    errors.push('diet_plan must be an object');
    return null;
  }
  const daily = isObject(raw.daily) ? raw.daily : {};
  const proteinG = Math.max(0, Math.round(num(daily.protein_g) ?? 0));
  const carbsG = Math.max(0, Math.round(num(daily.carbs_g) ?? 0));
  const fatG = Math.max(0, Math.round(num(daily.fat_g) ?? 0));
  const fromMacros = Math.round(macroKcal({ proteinG, carbsG, fatG }));
  const kcal = Math.round(num(daily.kcal) ?? fromMacros);
  if (kcal < MIN_DAILY_KCAL)
    errors.push(
      `diet_plan.daily.kcal is ${kcal}: the app does not allow targets under ${MIN_DAILY_KCAL} kcal`,
    );
  if (kcal > 10000) errors.push('diet_plan.daily.kcal is above 10000');
  if (proteinG + carbsG + fatG === 0)
    errors.push('diet_plan.daily needs protein_g, carbs_g and fat_g');
  if (fromMacros > 0 && Math.abs(fromMacros - kcal) / kcal > 0.1)
    warnings.push(`The daily macros come to ${fromMacros} kcal, not ${kcal}`);

  const meals: ImportedMeal[] = [];
  (Array.isArray(raw.meals) ? raw.meals : []).slice(0, 8).forEach((m, i) => {
    if (!isObject(m)) return;
    const p = Math.max(0, num(m.protein_g) ?? 0);
    const c = Math.max(0, num(m.carbs_g) ?? 0);
    const f = Math.max(0, num(m.fat_g) ?? 0);
    meals.push({
      name: text(m.name, 40) || `Meal ${i + 1}`,
      isMain: m.main === true || m.is_main === true,
      description: text(m.description, 300),
      proteinG: Math.round(p * 10) / 10,
      carbsG: Math.round(c * 10) / 10,
      fatG: Math.round(f * 10) / 10,
      kcal: Math.round(macroKcal({ proteinG: p, carbsG: c, fatG: f })),
    });
  });
  if (meals.length === 0) errors.push('diet_plan needs at least one meal');
  const after = text(raw.workout_after, 40);
  const workoutAfter =
    meals.find((m) => m.name.toLowerCase() === after.toLowerCase())?.name ?? null;
  if (after && !workoutAfter) warnings.push(`workout_after "${after}" is not one of the meals`);
  return errors.length ? null : { kcal, proteinG, carbsG, fatG, meals, workoutAfter };
}

/** Reads an AI reply (or pasted JSON): what it would import, plus what is wrong or worth knowing. */
export function parseBundle(input: string | unknown): ParsedBundle {
  const errors: string[] = [];
  const warnings: string[] = [];
  const json = typeof input === 'string' ? extractJson(input) : input;
  if (!isObject(json)) {
    return { workout: null, diet: null, errors: ['No JSON found in the text'], warnings };
  }
  const workout =
    json.workout_plan != null ? parseWorkout(json.workout_plan, errors, warnings) : null;
  const diet = json.diet_plan != null ? parseDiet(json.diet_plan, errors, warnings) : null;
  if (json.workout_plan == null && json.diet_plan == null)
    errors.push('Expected "workout_plan" and/or "diet_plan"');
  return { workout, diet, errors, warnings };
}

// --- matching exercise names ---------------------------------------------------------------------

export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The catalogue exercise an imported name means: exact (ignoring case and punctuation) or unique partial. */
export function matchExercise<T extends { name: string }>(
  name: string,
  list: readonly T[],
): T | null {
  const wanted = normalizeName(name);
  if (!wanted) return null;
  const exact = list.find((e) => normalizeName(e.name) === wanted);
  if (exact) return exact;
  if (wanted.length < 5) return null;
  const partial = list.filter((e) => {
    const n = normalizeName(e.name);
    return n.includes(wanted) || wanted.includes(n);
  });
  return partial.length === 1 ? partial[0] : null;
}

// --- the prompt for a manual AI chat -------------------------------------------------------------

export type PromptContext = {
  request: string;
  profile: string;
  exercises: readonly string[];
};

export const FORMAT_EXAMPLE = {
  workout_plan: {
    name: 'Push Pull Legs',
    days: [
      {
        name: 'Push',
        exercises: [
          { exercise: 'Barbell bench press', sets: 4, reps: '6-8', rest_s: 120, notes: '' },
          { exercise: 'Incline dumbbell press', sets: 3, reps: '8-12', rest_s: 90, notes: '' },
        ],
      },
    ],
  },
  diet_plan: {
    daily: { kcal: 2400, protein_g: 180, carbs_g: 250, fat_g: 70 },
    meals: [
      {
        name: 'Breakfast',
        main: false,
        description: 'Oats with milk and a banana',
        kcal: 550,
        protein_g: 35,
        carbs_g: 70,
        fat_g: 12,
      },
    ],
    workout_after: 'Lunch',
  },
};

/** Rules of the format, shared by the manual prompt and the chat's system prompt. */
export function formatRules(exercises: readonly string[]): string {
  return [
    'Answer with ONE JSON object in a ```json code block, then at most two short sentences. The JSON may contain "workout_plan", "diet_plan", or both.',
    'Format (keys and nesting exactly like this example, all numbers are plain numbers):',
    JSON.stringify(FORMAT_EXAMPLE, null, 2),
    'Rules:',
    `- workout_plan.days: 1 to 14 days, each with 1 to 20 exercises. sets 1-20, reps a string like "8-12", rest_s 0-1800 seconds.`,
    '- "exercise" must be one of the names in the EXERCISE LIST below, spelled exactly. If you really need another exercise, add "primary_muscle" (chest, back, shoulders, biceps, triceps, legs, glutes, abs), "equipment" (barbell, dumbbells, machine, cables, bodyweight, bands) and optionally "log_type" (weight_reps, reps, time, distance_time) to that exercise.',
    '- diet_plan.daily.kcal must be at least 1500 and the macros must match it (4 kcal per g of protein and carbs, 9 per g of fat). Never go below 1500 kcal or more than 25% under the maintenance calories.',
    '- diet_plan.meals: 1 to 8 meals that add up to the daily target. "main": true for bigger meals. "description" says what to eat. "workout_after" is the name of the meal after which the workout happens (optional).',
    '- Use metric units and English names.',
    'EXERCISE LIST:',
    exercises.join(', '),
  ].join('\n');
}

/** The text to paste into any AI chat so its answer can be imported back with "Import". */
export function buildImportPrompt(ctx: PromptContext): string {
  return [
    'You are a strength coach and sports nutritionist. Create what I ask for below.',
    '',
    `MY REQUEST: ${ctx.request.trim() || 'A balanced plan for me.'}`,
    '',
    `ABOUT ME: ${ctx.profile}`,
    '',
    formatRules(ctx.exercises),
  ].join('\n');
}

/** System prompt of the in-app chat: the format, plus how to modify what already exists. */
export function buildChatSystemPrompt(ctx: {
  profile: string;
  current: unknown;
  exercises: readonly string[];
}): string {
  return [
    'You are the coach inside a training and nutrition app. Chat briefly and practically, in the language the user writes in (the plan JSON stays in English).',
    'You can create and modify workout plans and the diet. When you propose or change a plan, include the whole plan as JSON so the app can apply it; the user reviews it before anything changes. Do not include JSON when you are only talking.',
    'To MODIFY an existing workout plan, return it again with the same "id" and "name" as in CURRENT DATA and all of its days (not only the changed ones). Without an "id" a new plan is created.',
    '',
    `ABOUT THE USER: ${ctx.profile}`,
    '',
    `CURRENT DATA: ${JSON.stringify(ctx.current)}`,
    '',
    formatRules(ctx.exercises),
  ].join('\n');
}

import { newId } from '../uuid';

/** The user of the account-less offline mode (accounts use their own id). */
export const LOCAL_USER_ID = '00000000-0000-4000-8000-0000000000a1';

export type Row = Record<string, unknown>;

/** Columns of every table, in the shape the app reads them (missing values read as null). */
export const columns: Record<string, string[]> = {
  profiles: [
    'id',
    'name',
    'birth_date',
    'sex',
    'height_cm',
    'activity_level',
    'experience',
    'training_location',
    'goal',
    'timezone',
    'diet_mode',
    'onboarding_completed_at',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  user_settings: [
    'user_id',
    'weight_unit',
    'length_unit',
    'energy_unit',
    'week_start',
    'accent',
    'theme',
    'workout_theme',
    'language',
    'text_scale',
    'bold_text',
    'dot_numbers',
    'high_contrast',
    'reduce_motion',
    'haptics',
    'one_hand_mode',
    'spoken_countdown',
    'water_glass_ml',
    'small_plates',
    'notifications',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  consents: [
    'id',
    'user_id',
    'type',
    'policy_version',
    'granted_at',
    'withdrawn_at',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  exercises: [
    'id',
    'owner_id',
    'slug',
    'name',
    'primary_muscle',
    'secondary_muscles',
    'equipment',
    'log_type',
    'image_path',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  workout_plans: [
    'id',
    'user_id',
    'name',
    'goal',
    'status',
    'source',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  plan_days: [
    'id',
    'user_id',
    'plan_id',
    'position',
    'name',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  plan_exercises: [
    'id',
    'user_id',
    'plan_day_id',
    'exercise_id',
    'position',
    'target_sets',
    'target_reps',
    'rest_s',
    'notes',
    'superset_with_next',
    'drop_on',
    'drop_reps',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  workout_sessions: [
    'id',
    'user_id',
    'plan_id',
    'plan_day_id',
    'day_name',
    'cycle_number',
    'out_of_order',
    'started_at',
    'ended_at',
    'feeling',
    'notes',
    'status',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  session_exercises: [
    'id',
    'user_id',
    'session_id',
    'exercise_id',
    'position',
    'rest_s',
    'notes',
    'superset_with_next',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  session_sets: [
    'id',
    'user_id',
    'session_id',
    'exercise_id',
    'set_index',
    'drop_index',
    'weight_kg',
    'reps',
    'duration_s',
    'distance_m',
    'completed_at',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  foods: [
    'id',
    'owner_id',
    'barcode',
    'name',
    'brand',
    'kcal_100g',
    'protein_100g',
    'carbs_100g',
    'sugars_100g',
    'fat_100g',
    'saturates_100g',
    'fiber_100g',
    'salt_100g',
    'source',
    'verified',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  food_servings: ['id', 'food_id', 'label', 'grams', 'created_at', 'updated_at', 'deleted_at'],
  food_logs: [
    'id',
    'user_id',
    'day',
    'meal',
    'food_id',
    'name',
    'quantity_label',
    'grams',
    'kcal',
    'protein_g',
    'carbs_g',
    'fat_g',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  nutrition_goals: [
    'id',
    'user_id',
    'valid_from',
    'kcal',
    'protein_g',
    'carbs_g',
    'fat_g',
    'training_day_bonus_kcal',
    'maintenance_kcal',
    'water_ml',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  fixed_meal_plans: [
    'id',
    'user_id',
    'name',
    'active',
    'source',
    'workout_after_meal_id',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  fixed_meals: [
    'id',
    'user_id',
    'plan_id',
    'position',
    'name',
    'kcal',
    'protein_g',
    'carbs_g',
    'fat_g',
    'description',
    'is_main',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  fixed_meal_checks: [
    'id',
    'user_id',
    'day',
    'fixed_meal_id',
    'status',
    'kcal',
    'protein_g',
    'carbs_g',
    'fat_g',
    'checked_at',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  water_logs: ['id', 'user_id', 'day', 'ml', 'created_at', 'updated_at', 'deleted_at'],
  supplements: [
    'id',
    'user_id',
    'name',
    'dose',
    'position',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  supplement_logs: [
    'id',
    'user_id',
    'day',
    'supplement_id',
    'taken_at',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  body_metrics: [
    'id',
    'user_id',
    'day',
    'weight_kg',
    'body_fat_pct',
    'bf_method',
    'waist_cm',
    'hips_cm',
    'chest_cm',
    'arm_cm',
    'thigh_cm',
    'notes',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  body_goals: [
    'id',
    'user_id',
    'valid_from',
    'start_weight_kg',
    'target_weight_kg',
    'target_body_fat_pct',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  progress_photos: [
    'id',
    'user_id',
    'day',
    'pose',
    'storage_path',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
};

export const tableNames = Object.keys(columns);

/** Tables whose rows belong to the user (user_id defaults to the local user). */
const userOwned = new Set([
  'consents',
  'workout_plans',
  'plan_days',
  'plan_exercises',
  'workout_sessions',
  'session_exercises',
  'session_sets',
  'food_logs',
  'nutrition_goals',
  'fixed_meal_plans',
  'fixed_meals',
  'fixed_meal_checks',
  'water_logs',
  'body_metrics',
  'body_goals',
  'progress_photos',
  'supplements',
  'supplement_logs',
]);

const specific: Record<string, () => Row> = {
  exercises: () => ({ secondary_muscles: [], log_type: 'weight_reps' }),
  workout_plans: () => ({ status: 'draft', source: 'manual' }),
  workout_sessions: () => ({
    out_of_order: false,
    status: 'active',
    started_at: new Date().toISOString(),
  }),
  plan_exercises: () => ({ target_sets: 3, target_reps: '8-12', rest_s: 90 }),
  foods: () => ({ source: 'custom', verified: false, protein_100g: 0, carbs_100g: 0, fat_100g: 0 }),
  food_logs: () => ({ protein_g: 0, carbs_g: 0, fat_g: 0 }),
  nutrition_goals: () => ({ training_day_bonus_kcal: 0, water_ml: 2000 }),
  fixed_meal_plans: () => ({ active: true, source: 'manual' }),
  fixed_meals: () => ({ protein_g: 0, carbs_g: 0, fat_g: 0, is_main: false }),
  fixed_meal_checks: () => ({
    kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    checked_at: new Date().toISOString(),
  }),
  consents: () => ({ granted_at: new Date().toISOString() }),
  supplements: () => ({ position: 0 }),
  supplement_logs: () => ({ taken_at: new Date().toISOString() }),
  profiles: () => ({ timezone: 'UTC', diet_mode: 'tracking' }),
  user_settings: () => ({
    weight_unit: 'kg',
    length_unit: 'cm',
    energy_unit: 'kcal',
    week_start: 'mon',
    accent: 'red',
    theme: 'light',
    workout_theme: 'light',
    language: 'en',
    text_scale: 3,
    bold_text: false,
    dot_numbers: true,
    high_contrast: false,
    reduce_motion: false,
    haptics: true,
    one_hand_mode: false,
    spoken_countdown: false,
    water_glass_ml: 250,
    small_plates: false,
    notifications: {
      rest_timer: true,
      workout_reminder: true,
      weekly_check_in: true,
      meals: false,
    },
  }),
};

/** A new row: every column present (null when empty), defaults applied like the database does. */
export function withDefaults(table: string, input: Row, userId: string): Row {
  const now = new Date().toISOString();
  const row: Row = {};
  for (const c of columns[table]) row[c] = null;
  if (columns[table].includes('id')) row.id = newId();
  if (userOwned.has(table)) row.user_id = userId;
  if (columns[table].includes('created_at')) row.created_at = now;
  if (columns[table].includes('updated_at')) row.updated_at = now;
  Object.assign(row, specific[table]?.() ?? {}, input);
  return row;
}

export type Relation = { table: string; many: boolean; local: string; foreign: string };

/** How embedded selects like `plan_days(*)` join: `local` of this table = `foreign` of the other. */
export const relations: Record<string, Record<string, Relation>> = {
  workout_plans: { plan_days: { table: 'plan_days', many: true, local: 'id', foreign: 'plan_id' } },
  plan_days: {
    plan_exercises: { table: 'plan_exercises', many: true, local: 'id', foreign: 'plan_day_id' },
  },
  plan_exercises: {
    exercises: { table: 'exercises', many: false, local: 'exercise_id', foreign: 'id' },
  },
  fixed_meal_plans: {
    fixed_meals: { table: 'fixed_meals', many: true, local: 'id', foreign: 'plan_id' },
  },
  foods: {
    food_servings: { table: 'food_servings', many: true, local: 'id', foreign: 'food_id' },
  },
  workout_sessions: {
    workout_plans: { table: 'workout_plans', many: false, local: 'plan_id', foreign: 'id' },
    session_sets: { table: 'session_sets', many: true, local: 'id', foreign: 'session_id' },
    session_exercises: {
      table: 'session_exercises',
      many: true,
      local: 'id',
      foreign: 'session_id',
    },
  },
  session_sets: {
    workout_sessions: {
      table: 'workout_sessions',
      many: false,
      local: 'session_id',
      foreign: 'id',
    },
  },
};

export type DbError = { message: string; code: string; details?: string };

const num = (v: unknown) => (v == null ? null : Number(v));

/** Constraints of the database that the app relies on (checks and unique indexes). */
export function checkRow(table: string, row: Row): DbError | null {
  const fail = (message: string): DbError => ({ message, code: '23514' });
  if (table === 'nutrition_goals') {
    const kcal = num(row.kcal);
    if (kcal == null || kcal < 1500 || kcal > 10000)
      return fail('new row violates check constraint "nutrition_goals_kcal_check"');
    const maintenance = num(row.maintenance_kcal);
    if (maintenance != null && kcal < maintenance * 0.75)
      return fail('new row violates check constraint "nutrition_goals_max_deficit"');
  }
  for (const key of ['name']) {
    if (
      [
        'workout_plans',
        'plan_days',
        'exercises',
        'foods',
        'fixed_meal_plans',
        'fixed_meals',
      ].includes(table) &&
      key in row &&
      String(row[key] ?? '').trim() === ''
    )
      return fail(`new row violates check constraint "${table}_${key}_check"`);
  }
  if (table === 'body_metrics') {
    const w = num(row.weight_kg);
    if (w != null && (w < 20 || w > 500))
      return fail('new row violates check constraint "body_metrics_weight_kg_check"');
  }
  return null;
}

type Unique = { name: string; cols: string[]; when: (r: Row) => boolean };
const alive = (r: Row) => r.deleted_at == null;

export const uniques: Record<string, Unique[]> = {
  workout_plans: [
    {
      name: 'workout_plans_one_active_idx',
      cols: ['user_id'],
      when: (r) => r.status === 'active' && alive(r),
    },
  ],
  fixed_meal_plans: [
    {
      name: 'fixed_meal_plans_one_active_idx',
      cols: ['user_id'],
      when: (r) => r.active === true && alive(r),
    },
  ],
  fixed_meal_checks: [
    {
      name: 'fixed_meal_checks_one_per_day_idx',
      cols: ['user_id', 'day', 'fixed_meal_id'],
      when: alive,
    },
  ],
  supplement_logs: [
    {
      name: 'supplement_logs_one_per_day_idx',
      cols: ['user_id', 'day', 'supplement_id'],
      when: alive,
    },
  ],
  session_exercises: [
    { name: 'session_exercises_unique_idx', cols: ['session_id', 'exercise_id'], when: alive },
  ],
  exercises: [
    { name: 'exercises_catalogue_slug_idx', cols: ['slug'], when: (r) => r.owner_id == null },
  ],
  foods: [
    {
      name: 'foods_global_barcode_idx',
      cols: ['barcode'],
      when: (r) => r.owner_id == null && r.barcode != null,
    },
  ],
};

export function uniqueViolation(table: string, rows: Row[], candidate: Row): DbError | null {
  for (const u of uniques[table] ?? []) {
    if (!u.when(candidate)) continue;
    const clash = rows.some(
      (r) => r.id !== candidate.id && u.when(r) && u.cols.every((c) => r[c] === candidate[c]),
    );
    if (clash)
      return {
        message: `duplicate key value violates unique constraint "${u.name}"`,
        code: '23505',
      };
  }
  return null;
}
